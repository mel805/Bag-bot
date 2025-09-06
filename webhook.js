const http = require('http');
const { exec } = require('child_process');

const PORT = 3001;

const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/github') {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', () => {
      console.log('Webhook reçu. Mise à jour du dépôt...');
      exec('cd ~/Bag-bot && git pull origin main && pm2 restart bagbot', (err, stdout, stderr) => {
        if (err) {
          console.error(`Erreur de mise à jour : ${err}`);
          return res.end('Erreur');
        }
        console.log(`Mise à jour : ${stdout}`);
        res.end('OK');
      });
    });
  } else {
    res.writeHead(404);
    res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Serveur Webhook actif sur le port ${PORT}`);
});
