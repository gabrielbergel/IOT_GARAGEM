import mqtt from 'mqtt';
import axios from 'axios';

// --- CONFIGURAÇÕES (com as mudanças) ---
const BROKER_URL = 'mqtt://test.mosquitto.org';

// --- MUDANÇA: Usando um wildcard '#' para escutar todos os tópicos dentro de 'garagem/vagas/' ---
const TOPIC_WILDCARD = 'garagem/vagas/#'; 

// Coloque a URL do seu Worker aqui
const WORKER_URL = 'https://worker-garagem.gabriellbergel.workers.dev/';

// --- MUDANÇA: Adicionamos um objeto para ser a "memória" da ponte ---
// Ele vai guardar os últimos dados recebidos de cada vaga.
let vagasState = {};

console.log('--- Ponte Local Node.js (Versão Multi-Tópico) ---');
console.log(`Conectando ao broker: ${BROKER_URL}`);

const client = mqtt.connect(BROKER_URL);

client.on('connect', () => {
  console.log('✅ Conectado ao Broker MQTT.');
  // --- MUDANÇA: Se inscreve no tópico wildcard ---
  client.subscribe(TOPIC_WILDCARD, (err) => {
    if (err) {
      console.error('Falha ao se inscrever no tópico:', err);
      return;
    }
    console.log(`✅ Inscrito no tópico wildcard: ${TOPIC_WILDCARD}`);
    console.log('----------------------------------------------------');
    console.log('Aguardando mensagens dos sensores...');
  });
});

// --- MUDANÇA: A lógica para processar as mensagens agora é mais inteligente ---
client.on('message', async (topic, message) => {
  try {
    const messageString = message.toString();
    const data = JSON.parse(messageString);
    const vagaId = data.id;

    if (!vagaId) return; // Ignora mensagens que não tenham um ID

    // Cria um "caderno de anotações" para a vaga se for a primeira vez que a vemos
    if (!vagasState[vagaId]) {
      vagasState[vagaId] = { id: vagaId };
    }

    // Usa o tópico para saber qual informação guardar no "caderno"
    if (topic.endsWith('/distancia')) {
      vagasState[vagaId].distancia_cm = data.distancia_cm;
      console.log(`📬 [${vagaId}] Atualizou Distância: ${data.distancia_cm} cm`);
    } else if (topic.endsWith('/ruido')) {
      vagasState[vagaId].nivel_ruido_raw = data.nivel_ruido_raw;
      console.log(`📬 [${vagaId}] Atualizou Ruído: ${data.nivel_ruido_raw}`);
    } else if (topic.endsWith('/status')) {
      vagasState[vagaId].status = data.status;
      console.log(`📬 [${vagaId}] Atualizou Status: ${data.status}`);
    }
    
    // Pega todos os dados que temos até agora para a vaga
    const pacoteCompleto = vagasState[vagaId];

    // VERIFICAÇÃO FINAL: Só envia para o Worker se tivermos todos os 4 dados.
    if (pacoteCompleto.id && pacoteCompleto.status && pacoteCompleto.distancia_cm !== undefined && pacoteCompleto.nivel_ruido_raw !== undefined) {
      
      console.log(`\n📦 Pacote completo montado para ${vagaId}.`);
      console.log(`🚀 Enviando para o Worker: ${WORKER_URL}`);

      // Envia o OBJETO COMPLETO para o Worker
      const response = await axios.post(WORKER_URL, pacoteCompleto, {
          headers: { 'Content-Type': 'application/json' }
      });

      console.log(`✅ Sucesso! Resposta do Worker (Status ${response.status}):`, response.data);
      console.log('----------------------------------------------------');

      // Limpa os dados de telemetria (distancia e ruido) para aguardar a próxima atualização de 5s do ESP32,
      // mas mantém o status, que só é enviado quando muda.
      delete vagasState[vagaId].distancia_cm;
      delete vagasState[vagaId].nivel_ruido_raw;
    }

  } catch (error) {
    if (error.response) {
      console.error(`❌ Erro do Worker (Status ${error.response.status}):`, error.response.data);
    } else {
      console.error('❌ Erro no script da ponte:', error.message);
    }
  }
});
