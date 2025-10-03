import mqtt from 'mqtt';
import axios from 'axios';

const BROKER_URL = 'mqtt://test.mosquitto.org';
const TOPIC = 'garagem/vagas/status';
// Coloque a URL do seu Worker aqui quando for testar com ele
const WORKER_URL = 'https://worker-garagem.gabriellbergel.workers.dev/';

console.log('--- Ponte Local Node.js (Versão Corrigida) ---');
console.log(`Conectando ao broker: ${BROKER_URL}`);

const client = mqtt.connect(BROKER_URL);

client.on('connect', () => {
  console.log('✅ Conectado ao Broker MQTT.');
  client.subscribe(TOPIC, () => {
    console.log(`✅ Inscrito no tópico: ${TOPIC}`);
    console.log('----------------------------------------------------');
    console.log('Aguardando mensagens...');
  });
});

client.on('message', async (topic, message) => {
  try {
    const messageString = message.toString();
    console.log(`\n📬 [${new Date().toLocaleTimeString()}] Mensagem recebida: ${messageString}`);

    // 1. Converte a mensagem em um objeto JavaScript
    const messageObject = JSON.parse(messageString);

    console.log(`🚀 Enviando OBJETO PURO para o Worker: ${WORKER_URL}`);

    // 2. ENVIA O OBJETO DIRETAMENTE, SEM EMBRULHAR OU CODIFICAR
    const response = await axios.post(WORKER_URL, messageObject, {
        // Garante que o header correto seja enviado
        headers: {
            'Content-Type': 'application/json'
        }
    });

    console.log(`✅ Sucesso! Resposta do Worker (Status ${response.status}):`, response.data);

  } catch (error) {
    if (error.response) {
      console.error(`❌ Erro do Worker (Status ${error.response.status}):`, error.response.data);
    } else {
      console.error('❌ Erro no script da ponte:', error.message);
    }
  }
});