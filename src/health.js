const http = require('http');

// Health check endpoint optimized for Render free plan keep-alive
const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/keep-alive') {
        const response = { 
            status: 'healthy', 
            timestamp: new Date().toISOString(),
            service: 'bag-discord-bot',
            uptime: Math.floor(process.uptime()),
            memory: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
            plan: 'render-free-keepalive'
        };
        
        // Log keep-alive pings for monitoring
        if (req.url === '/keep-alive') {
            console.log(`[KeepAlive] Ping received at ${new Date().toISOString()}`);
            response.message = 'Bot is active and ready';
        }
        
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(response));
    } else {
        res.writeHead(404);
        res.end('Not Found');
    }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Health check server running on port ${PORT}`);
    console.log(`Keep-alive endpoint: http://localhost:${PORT}/keep-alive`);
});

module.exports = server;
