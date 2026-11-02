<?php
/**
 * AmarBoost & BDSMMPANEL Automated Reseller Order Forwarder Script
 * 
 * This PHP script acts as an automated bridge/webhook receiver for a reseller SMM panel.
 * When your reseller panel receives a new customer order, it triggers/calls this script
 * with the order details. This script then uses the standard SMM API Class to safely
 * forward the order to bdsmmpanel.com, validates the endpoint responses, handles errors,
 * and outputs status state.
 * 
 * Target Endpoint: https://justanotherpanel.com/api/v2
 */

// --- CONFIGURATION ---
define('API_URL', 'https://justanotherpanel.com/api/v2');
define('API_KEY', '32363638a5d934c4cfddf0ec8d5d493f'); // JustAnotherPanel API Key

// --- STANDARD SMM PANEL API INTERACTION CLASS ---
class Api
{
    private $apiUrl;
    private $apiKey;

    /**
     * Api constructor.
     * @param string $apiKey Your SMM panel API key
     * @param string $apiUrl The SMM panel API integration URL
     */
    public function __construct($apiKey, $apiUrl)
    {
        $this->apiKey = $apiKey;
        $this->apiUrl = rtrim($apiUrl, '/');
    }

    /**
     * Send requests to the SMM Panel API.
     * @param array $params Request parameters
     * @return mixed Decoded JSON object or false on error
     */
    public function request($params)
    {
        // Inject required API key authentication
        $params['key'] = $this->apiKey;

        // Convert key-value parameters to query/post format
        $postData = http_build_query($params);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $this->apiUrl);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false); // For compatibility, can set to true in solid prod environments
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        curl_setopt($ch, CURLOPT_USERAGENT, 'SMMResellerForwarder/1.0 (PHP)');

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            throw new Exception("Curl request failed: " . $curlError);
        }

        if ($httpCode >= 400) {
            throw new Exception("API server returned HTTP error status code: " . $httpCode);
        }

        $decoded = json_decode($response, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            throw new Exception("Invalid response encoding received from SMM server: " . $response);
        }

        return $decoded;
    }

    /**
     * Check current wallet/account balance.
     */
    public function getBalance()
    {
        return $this->request(['action' => 'balance']);
    }

    /**
     * Check current wallet/account balance (alias for consistency).
     */
    public function balance()
    {
        return $this->getBalance();
    }

    /**
     * Place a new order on SMM panel.
     */
    public function placeOrder($serviceId, $link, $quantity, $customParams = [])
    {
        $params = array_merge([
            'action'   => 'add',
            'service'  => $serviceId,
            'link'     => $link,
            'quantity' => $quantity
        ], $customParams);

        return $this->request($params);
    }

    /**
     * Check status of a previously placed order using $api->status().
     * Returns details like 'charge', 'remains', and 'start count'.
     */
    public function status($orderId)
    {
        return $this->request([
            'action' => 'status',
            'order'  => $orderId
        ]);
    }

    /**
     * Check status of a previously placed order (alias for getOrderStatus).
     */
    public function getOrderStatus($orderId)
    {
        return $this->status($orderId);
    }

    /**
     * Check multiple order statuses simultaneously using $api->multiStatus().
     * Returns array mapping each order ID to 'charge', 'remains', 'start count', and 'status'.
     * @param array|string $orderIds
     */
    public function multiStatus($orderIds)
    {
        $ids = is_array($orderIds) ? implode(',', $orderIds) : $orderIds;
        return $this->request([
            'action' => 'status',
            'orders' => $ids
        ]);
    }
}


// --- HYPOTHETICAL RESELLER WEBHOOK CONTROLLER HANDLING ---

// Restrict response type strictly to JSON
header('Content-Type: application/json; charset=utf-8');

try {
    // 1. Retrieve the incoming JSON payload from your reseller platform
    $rawInput = file_get_contents('php://input');
    
    // Fallback to $_POST for classic forms, otherwise parse raw JSON body
    $incomingPayload = !empty($rawInput) ? json_decode($rawInput, true) : $_POST;

    if (empty($incomingPayload)) {
        throw new Exception("Payload is empty. Reseller panel details must be sent via POST/JSON body.");
    }

    // 2. Validate presence of core order details from your system database
    // Expected incoming fields:
    // - external_service_id: The ID of the matching service on bdsmmpanel.com
    // - target_link: The social media target url (e.g. video link)
    // - order_qty: Number of views/subscribers requested
    // - client_reference_id: Your internal DB absolute order order ID to trace logs
    $serviceId = isset($incomingPayload['external_service_id']) ? intval($incomingPayload['external_service_id']) : null;
    $link      = isset($incomingPayload['target_link']) ? trim($incomingPayload['target_link']) : null;
    $quantity  = isset($incomingPayload['order_qty']) ? intval($incomingPayload['order_qty']) : null;
    $clientRef = isset($incomingPayload['client_reference_id']) ? trim($incomingPayload['client_reference_id']) : 'N/A';

    if (!$serviceId || empty($link) || !$quantity) {
        http_response_code(400);
        echo json_encode([
            'success' => false,
            'error'   => 'Missing required order details.',
            'required_fields' => [
                'external_service_id' => 'Integer ID of the SMM API Service',
                'target_link' => 'Target social media URL string',
                'order_qty' => 'Numeric count of views / likes / subscribers'
            ]
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        exit;
    }

    // 3. Initialize API SDK module 
    if (API_KEY === 'YOUR_BDSMMPANEL_API_KEY_HERE') {
        throw new Exception("API_KEY configurations is unconfigured. Set the API_KEY constant in the script header.");
    }

    $api = new Api(API_KEY, API_URL);

    // 4. (Optional but recommended) Safety precheck of SMM balance to ensure adequate funds
    $balanceCheck = $api->getBalance();
    $currentBalance = isset($balanceCheck['balance']) ? floatval($balanceCheck['balance']) : 0;
    
    // 5. Instantly submit/place the order on BDSmmPanel
    // Gather and append any additional client metadata if required
    $extraArgs = [];
    if (isset($incomingPayload['custom_comments'])) {
        $extraArgs['comments'] = $incomingPayload['custom_comments'];
    }

    $orderResult = $api->placeOrder($serviceId, $link, $quantity, $extraArgs);

    // 6. Inspect response and handle potential panel failures (e.g. Service disabled, qty limits, etc.)
    if (isset($orderResult['error'])) {
        http_response_code(422);
        echo json_encode([
            'success' => false,
            'message' => 'The order was rejected by standard bdsmmpanel.com server policies.',
            'error_detail' => $orderResult['error'],
            'client_reference_id' => $clientRef,
            'api_wallet_balance' => $currentBalance
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
        exit;
    }

    // 7. Successful Fulfillment Return State
    if (isset($orderResult['order'])) {
        $remoteOrderId = $orderResult['order'];
        
        // Output clean response back to your hosting server database controller
        echo json_encode([
            'success' => true,
            'message' => 'Reseller order was successfully forwarded and integrated!',
            'remote_order_id' => $remoteOrderId,
            'client_reference_id' => $clientRef,
            'balance_remaining' => $currentBalance,
            'timestamp' => date('Y-m-d H:i:s')
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    } else {
        throw new Exception("Unexpected response format received from upstream API: " . json_encode($orderResult));
    }

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error'   => 'System error occurred during reseller order routing processes.',
        'exception_details' => $e->getMessage()
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
}
