<?php
/**
 * Automated Reseller Order Script for bdsmmpanel.com integration
 * 
 * This PHP script acts as a webhook / listener or controller in a reseller panel.
 * It automatically maps and forwards incoming reseller orders to the provider API using
 * the standard bdsmmpanel.com `Api` class, checks for success or failures, logs results,
 * and replies to the reseller system.
 */

// Define API Credentials
define('BDSMM_API_KEY', '32363638a5d934c4cfddf0ec8d5d493f'); // JustAnotherPanel API Key
define('BDSMM_API_URL', 'https://justanotherpanel.com/api/v2'); // JustAnotherPanel API Endpoint

/**
 * Supplied bdsmmpanel.com API Client class
 */
class Api {
    private $api_url;
    private $api_key;

    public function __construct($api_url, $api_key) {
        $this->api_url = $api_url;
        $this->api_key = $api_key;
    }

    /**
     * Executes standard POST action to API endpoint
     */
    public function connect($params) {
        $params['key'] = $this->api_key;
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $this->api_url);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($params));
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);
        
        $response = curl_exec($ch);
        $error = curl_error($ch);
        curl_close($ch);

        if ($error) {
            return json_encode([
                'error' => "CURL_ERROR: " . $error
            ]);
        }

        return $response;
    }

    /**
     * Fetch the user's / reseller's SMM account balance.
     */
    public function balance() {
        $result = $this->connect(['action' => 'balance']);
        return json_decode($result, true);
    }

    /**
     * Fetch single order status details like 'charge', 'remains', and 'start count'
     * @param int|string $order_id
     * @return array
     */
    public function status($order_id) {
        $result = $this->connect([
            'action' => 'status',
            'order'  => $order_id
        ]);
        return json_decode($result, true);
    }

    /**
     * Fetch multiple order statuses simultaneously using comma-separated IDs
     * Returns details like 'charge', 'remains', and 'start count' for each order
     * @param array|string $order_ids Array of order IDs or comma-separated string
     * @return array
     */
    public function multiStatus($order_ids) {
        $ids = is_array($order_ids) ? implode(',', $order_ids) : $order_ids;
        $result = $this->connect([
            'action' => 'status',
            'orders' => $ids
        ]);
        return json_decode($result, true);
    }
}

// ============================================
// SIMULATION / INCOMING EXECUTOR GATEWAY
// ============================================

// Set header for clean JSON response
header('Content-Type: application/json; charset=utf-8');

try {
    // 1. Capture incoming order details from the reseller panel hook (POST Payload)
    // E.g., incoming fields: service_id, target_link, target_quantity, customer_id
    $rawInput = file_get_contents('php://input');
    $incomingData = json_decode($rawInput, true);

    // If data is sent via standard form POST instead of JSON
    if (empty($incomingData)) {
        $incomingData = $_POST;
    }

    // 2. Validate mandatory incoming fields
    $requiredFields = ['service_id', 'link', 'quantity', 'customer_username'];
    foreach ($requiredFields as $field) {
        if (!isset($incomingData[$field]) || empty($incomingData[$field])) {
            throw new Exception("Missing mandatory reseller code attribute: " . $field);
        }
    }

    $resellerServiceId = intval($incomingData['service_id']);
    $targetLink        = trim($incomingData['link']);
    $targetQuantity    = intval($incomingData['quantity']);
    $customerName      = trim($incomingData['customer_username']);

    // Map your local reseller service ID to bdsmmpanel.com API service ID
    // (In a production system you would retrieve this mapping from a database table)
    $serviceMappingTable = [
        101 => 1345, // Map reseller SMM Service ID 101 to bdsmmpanel Service ID 1345
        102 => 2190, // Map 102 to 2190
        103 => 4032, // Map 103 to 4032
    ];

    // Determine target API service id
    $apiServiceId = isset($serviceMappingTable[$resellerServiceId]) 
        ? $serviceMappingTable[$resellerServiceId] 
        : $resellerServiceId; // default fallback if already SMM service ID

    // 3. Initialize connection to bdsmmpanel SMM Provider API
    $apiClient = new Api(BDSMM_API_URL, BDSMM_API_KEY);

    // Prepare standard API fields for order creation
    $orderParams = [
        'action'   => 'add',
        'service'  => $apiServiceId,
        'link'     => $targetLink,
        'quantity' => $targetQuantity
    ];

    // 4. Place the order with the remote provider API
    $apiResponseRaw = $apiClient->connect($orderParams);
    $apiResponse = json_decode($apiResponseRaw, true);

    // 5. Handle and process the API feedback responses
    if (!$apiResponse) {
        throw new Exception("Empty or invalid raw response from provider API: " . $apiResponseRaw);
    }

    if (isset($apiResponse['error'])) {
        // Log Error details appropriately for admins
        error_log("[RESELLER_PANEL_ALERT] Order mapping failed for customer '" . $customerName . "'. API Error: " . $apiResponse['error']);
        
        // Return structured error response
        echo json_encode([
            'success' => false,
            'message' => 'Supplier API Error occurred while placing SMM target order.',
            'provider_error' => $apiResponse['error'],
            'timestamp' => date('c')
        ]);
        exit;
    }

    if (isset($apiResponse['order'])) {
        // Success payload received! (Format: array('order' => 123456))
        $providerOrderId = $apiResponse['order'];

        // Optionally execute a balance/status check on the provider side
        $statusCheckParams = [
            'action' => 'status',
            'order'  => $providerOrderId
        ];
        $statusResponseRaw = $apiClient->connect($statusCheckParams);
        $statusResponse = json_decode($statusResponseRaw, true);

        // Respond with complete transaction success status block
        echo json_encode([
            'success' => true,
            'message' => 'Order successfully mapped and placed on bdsmmpanel.com API!',
            'transaction' => [
                'customer' => $customerName,
                'reseller_service_id' => $resellerServiceId,
                'provider_service_id' => $apiServiceId,
                'provider_order_id'   => $providerOrderId,
                'quantity' => $targetQuantity,
                'link' => $targetLink,
                'provider_status' => isset($statusResponse['status']) ? $statusResponse['status'] : 'Pending',
                'provider_start_count' => isset($statusResponse['start_count']) ? $statusResponse['start_count'] : 0,
                'provider_remains' => isset($statusResponse['remains']) ? $statusResponse['remains'] : $targetQuantity
            ],
            'timestamp' => date('c')
        ]);
        exit;
    }

    // Default fallback in case of unknown response structure
    throw new Exception("Unknown API response code: " . $apiResponseRaw);

} catch (Exception $e) {
    // Log unexpected exceptions for administrators
    error_log("[RESELLER_PANEL_CRITICAL] Webhook client error: " . $e->getMessage());

    echo json_encode([
        'success' => false,
        'message' => 'An exception occurred during reseller order automated creation.',
        'error_details' => $e->getMessage(),
        'timestamp' => date('c')
    ], JSON_PRETTY_PRINT);
}
