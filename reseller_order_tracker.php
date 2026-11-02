<?php
/**
 * AmarBoost & SMM Reseller Order Status Tracker
 * 
 * This PHP script implements tracking of user order statuses using the standard
 * SMM panel API methods:
 *   - $api->status($order_id): retrieves single order status, charge, remains, and start count
 *   - $api->multiStatus($order_ids): retrieves multiple order statuses in a single batch request
 * 
 * Supports both CLI execution and Web browser viewing with a clean UI.
 */

// --- CONFIGURATION ---
define('PROVIDER_API_KEY', '32363638a5d934c4cfddf0ec8d5d493f');
define('PROVIDER_API_URL', 'https://justanotherpanel.com/api/v2');

class Api
{
    private $apiUrl;
    private $apiKey;

    public function __construct($apiKey, $apiUrl)
    {
        $this->apiKey = $apiKey;
        $this->apiUrl = rtrim($apiUrl, '/');
    }

    /**
     * Send HTTP POST request to SMM Provider API
     */
    public function request($params)
    {
        $params['key'] = $this->apiKey;
        $postData = http_build_query($params);

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $this->apiUrl);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, $postData);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 30);

        $response = curl_exec($ch);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($response === false) {
            return ['error' => 'Curl connection error: ' . $curlError];
        }

        $decoded = json_decode($response, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            return ['error' => 'Invalid JSON from server: ' . $response];
        }

        return $decoded;
    }

    /**
     * Fetch status of a single order using action 'status'
     * Returns details: 'charge', 'remains', 'start_count', 'status'
     */
    public function status($orderId)
    {
        return $this->request([
            'action' => 'status',
            'order'  => $orderId
        ]);
    }

    /**
     * Fetch multiple order statuses simultaneously using comma-separated IDs
     * Returns a map of order ID => ['charge', 'remains', 'start_count', 'status']
     */
    public function multiStatus($orderIds)
    {
        $ids = is_array($orderIds) ? implode(',', $orderIds) : $orderIds;
        return $this->request([
            'action' => 'status',
            'orders' => $ids
        ]);
    }

    /**
     * Check wallet balance
     */
    public function balance()
    {
        return $this->request(['action' => 'balance']);
    }
}

// 1. Initialize API Client
$api = new Api(PROVIDER_API_KEY, PROVIDER_API_URL);

// 2. Demo or User Input Handling
$searchedOrderId = isset($_GET['order_id']) ? trim($_GET['order_id']) : (isset($_POST['order_id']) ? trim($_POST['order_id']) : null);
$singleOrderResult = null;
$multiStatusResults = null;

// Mock list of recent orders for demonstration
$recentOrders = [
    ['id' => 101, 'provider_id' => 100245, 'service' => 'YouTube Views High Retention', 'quantity' => 1000, 'charge' => '1.50'],
    ['id' => 102, 'provider_id' => 100246, 'service' => 'Instagram Followers Real Non-Drop', 'quantity' => 500, 'charge' => '0.85'],
    ['id' => 103, 'provider_id' => 100247, 'service' => 'Facebook Page Likes Bangladeshi', 'quantity' => 2000, 'charge' => '2.40']
];

// Single Order Lookup using $api->status()
if (!empty($searchedOrderId)) {
    $singleOrderResult = $api->status($searchedOrderId);
}

// Batch Multi-Status Tracking for recent orders using $api->multiStatus()
$providerOrderIds = array_column($recentOrders, 'provider_id');
$multiStatusResults = $api->multiStatus($providerOrderIds);

// Return JSON if requested by API client
if (isset($_GET['format']) && $_GET['format'] === 'json') {
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'searched_order' => $searchedOrderId,
        'single_result' => $singleOrderResult,
        'recent_orders' => $recentOrders,
        'multi_status_results' => $multiStatusResults
    ], JSON_PRETTY_PRINT);
    exit;
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SMM Order Status Tracker ($api->status & $api->multiStatus)</title>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen p-6 font-sans">
    <div class="max-w-4xl mx-auto space-y-6">
        <header class="border-b border-slate-800 pb-4">
            <h1 class="text-2xl font-black tracking-tight text-white flex items-center gap-3">
                <span class="p-2 bg-indigo-600 rounded-xl text-white">⚡</span>
                SMM Order Status Tracker
            </h1>
            <p class="text-xs text-slate-400 mt-1">Utilizes <code>$api-&gt;status()</code> and <code>$api-&gt;multiStatus()</code> to query live order details.</p>
        </header>

        <!-- Search / Track by Order ID -->
        <section class="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-5 shadow-lg">
            <h2 class="text-sm font-bold uppercase tracking-wider text-slate-300 mb-3">Track Single Order (<code>$api-&gt;status()</code>)</h2>
            <form method="GET" class="flex gap-2">
                <input 
                    type="text" 
                    name="order_id" 
                    placeholder="Enter Order ID (e.g. 100245)" 
                    value="<?php echo htmlspecialchars($searchedOrderId ?? ''); ?>"
                    class="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-indigo-500"
                    required
                >
                <button type="submit" class="bg-indigo-600 hover:bg-indigo-500 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all shadow-md">
                    Track Status
                </button>
            </form>

            <?php if ($singleOrderResult): ?>
                <div class="mt-4 p-4 bg-slate-900/90 border border-indigo-500/30 rounded-xl space-y-2">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-bold uppercase tracking-widest text-indigo-400">Order #<?php echo htmlspecialchars($searchedOrderId); ?></span>
                        <span class="px-2.5 py-1 rounded-full text-xs font-black uppercase bg-indigo-950 text-indigo-300 border border-indigo-800">
                            <?php echo htmlspecialchars($singleOrderResult['status'] ?? 'Unknown'); ?>
                        </span>
                    </div>
                    <div class="grid grid-cols-3 gap-3 pt-2 text-center">
                        <div class="p-2 bg-slate-800 rounded-lg">
                            <span class="text-[10px] uppercase text-slate-400 font-bold block">Charge</span>
                            <span class="text-sm font-black text-emerald-400">$<?php echo htmlspecialchars($singleOrderResult['charge'] ?? '0.00'); ?></span>
                        </div>
                        <div class="p-2 bg-slate-800 rounded-lg">
                            <span class="text-[10px] uppercase text-slate-400 font-bold block">Start Count</span>
                            <span class="text-sm font-black text-blue-400"><?php echo htmlspecialchars($singleOrderResult['start_count'] ?? '0'); ?></span>
                        </div>
                        <div class="p-2 bg-slate-800 rounded-lg">
                            <span class="text-[10px] uppercase text-slate-400 font-bold block">Remains</span>
                            <span class="text-sm font-black text-amber-400"><?php echo htmlspecialchars($singleOrderResult['remains'] ?? '0'); ?></span>
                        </div>
                    </div>
                </div>
            <?php endif; ?>
        </section>

        <!-- Batch MultiStatus Orders -->
        <section class="bg-slate-800/80 border border-slate-700/60 rounded-2xl p-5 shadow-lg space-y-4">
            <div class="flex items-center justify-between">
                <div>
                    <h2 class="text-sm font-bold uppercase tracking-wider text-slate-300">Recent Orders (<code>$api-&gt;multiStatus()</code>)</h2>
                    <p class="text-xs text-slate-400 mt-0.5">Batch status lookup across all active orders.</p>
                </div>
                <a href="?refresh=1" class="text-xs bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg text-slate-200 transition-all">
                    🔄 Refresh All
                </a>
            </div>

            <div class="overflow-x-auto">
                <table class="w-full text-left text-xs">
                    <thead>
                        <tr class="border-b border-slate-700 text-slate-400 uppercase font-bold text-[10px]">
                            <th class="py-2.5 px-3">Order ID</th>
                            <th class="py-2.5 px-3">Service</th>
                            <th class="py-2.5 px-3">Quantity</th>
                            <th class="py-2.5 px-3">Charge</th>
                            <th class="py-2.5 px-3">Start Count</th>
                            <th class="py-2.5 px-3">Remains</th>
                            <th class="py-2.5 px-3">Status</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-700/50">
                        <?php foreach ($recentOrders as $order): 
                            $provId = (string)$order['provider_id'];
                            $statusInfo = isset($multiStatusResults[$provId]) ? $multiStatusResults[$provId] : [];
                            $charge = $statusInfo['charge'] ?? $order['charge'];
                            $startCount = $statusInfo['start_count'] ?? '0';
                            $remains = $statusInfo['remains'] ?? $order['quantity'];
                            $status = $statusInfo['status'] ?? 'Pending';
                        ?>
                        <tr class="hover:bg-slate-700/30 transition-all">
                            <td class="py-3 px-3 font-mono font-bold text-indigo-400">#<?php echo $order['id']; ?></td>
                            <td class="py-3 px-3 font-medium text-slate-200"><?php echo htmlspecialchars($order['service']); ?></td>
                            <td class="py-3 px-3 font-mono"><?php echo number_format($order['quantity']); ?></td>
                            <td class="py-3 px-3 font-mono text-emerald-400">$<?php echo htmlspecialchars($charge); ?></td>
                            <td class="py-3 px-3 font-mono text-blue-400"><?php echo htmlspecialchars($startCount); ?></td>
                            <td class="py-3 px-3 font-mono text-amber-400"><?php echo htmlspecialchars($remains); ?></td>
                            <td class="py-3 px-3">
                                <span class="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-slate-700 text-slate-300">
                                    <?php echo htmlspecialchars($status); ?>
                                </span>
                            </td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        </section>
    </div>
</body>
</html>
