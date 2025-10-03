

# --- 1. FERRAMENTAS E PRÉ-REQUISITOS ---

# - Node.js & NPM: para gerenciar o Wrangler
# - Wrangler CLI: ferramenta de linha de comando da Cloudflare
# - Python 3 & PIP: para o script da ponte (bridge) MQTT
# - Arduino IDE: para o firmware do ESP32 (com suporte para ESP32 instalado)
# - Git: para controle de versão

# -----------------------------------------------------------------------------
# --- 2. BACKEND: CLOUDFLARE WORKER & D1 DATABASE ---
# -----------------------------------------------------------------------------

# Instalar/Atualizar o Wrangler CLI
npm install -g wrangler

# Autenticar com sua conta Cloudflare
wrangler login

# Comandos SQL para criar a tabela no dashboard do D1
# Cole isso na console do seu banco de dados D1.
# NOME DO BANCO (exemplo): garagem-db
#
# CREATE TABLE vagas (
#   id TEXT PRIMARY KEY,
#   status TEXT NOT NULL,
#   distancia_cm INTEGER,
#   nivel_ruido_raw INTEGER,
#   ultima_atualizacao TEXT
# );

# Arquivo de configuração `wrangler.toml`
# Este arquivo define seu projeto e conecta o Worker ao D1.
# Crie este arquivo na raiz do seu projeto.
# SUBSTITUA os valores de 'name', 'database_name' e 'database_id'.

cat <<EOF > wrangler.toml
name = "garagem-worker" # Nome do seu Worker
main = "src/index.js"
compatibility_date = "2023-10-26"

[[d1_databases]]
binding = "DB" # Nome da variável para acessar o DB no código do worker
database_name = "garagem-db"
database_id = "SEU_DATABASE_ID_AQUI"
EOF

# O código do Worker (src/index.js) não está aqui para brevidade.
# Use o código completo da conversa anterior.

# Fazer o deploy do Worker para a nuvem da Cloudflare
wrangler deploy

# -----------------------------------------------------------------------------
# --- 3. PONTE (BRIDGE): MQTT PARA HTTP ---
# -----------------------------------------------------------------------------

# Instalar dependências Python
pip install paho-mqtt requests

# Script da ponte: `bridge.py`
# Este script escuta o tópico MQTT e envia os dados para o Worker.
# SUBSTITUA a 'WORKER_URL' pela URL fornecida após o `wrangler deploy`.

cat <<EOF > bridge.py
import paho.mqtt.client as mqtt
import requests
import json
import time

# --- CONFIGURAÇÕES ---
MQTT_BROKER = "broker.hivemq.com"
MQTT_PORT = 1883
MQTT_TOPIC = "estacionamento/status_vaga"
# MUDE A URL ABAIXO PARA A URL DO SEU WORKER
WORKER_URL = "https://garagem-worker.seu-subdominio.workers.dev/"

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print(f"Conectado ao Broker MQTT: {MQTT_BROKER}")
        client.subscribe(MQTT_TOPIC)
    else:
        print(f"Falha na conexão, código de retorno: {rc}")

def on_message(client, userdata, msg):
    payload_str = msg.payload.decode('utf-8')
    print(f"Recebido [{msg.topic}]: {payload_str}")
    try:
        data = json.loads(payload_str)
        response = requests.post(WORKER_URL, json=data, timeout=10)
        print(f"POST para Worker -> Status: {response.status_code}, Resposta: {response.text}")
    except Exception as e:
        print(f"ERRO: {e}")

client = mqtt.Client(client_id=f"bridge-{int(time.time())}")
client.on_connect = on_connect
client.on_message = on_message
client.connect(MQTT_BROKER, MQTT_PORT, 60)
client.loop_forever()
EOF

# Executar a ponte
# Mantenha este terminal aberto para a ponte continuar funcionando.
# python bridge.py

# -----------------------------------------------------------------------------
# --- 4. FIRMWARE: ESP32 (ARDUINO/C++) ---
# -----------------------------------------------------------------------------

# Bibliotecas necessárias na Arduino IDE:
# - PubSubClient (de Nick O'Leary)
# - ArduinoJson (de Benoit Blanchon)

# Código do Firmware: `esp32_firmware.ino`
# Cole este código na sua Arduino IDE.
# SUBSTITUA as configurações de WiFi, MQTT e o ID da vaga.

cat <<EOF > esp32_firmware.ino
#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// --- CONFIGURAÇÕES - ALTERE AQUI ---
const char* WIFI_SSID = "NOME_DA_SUA_REDE_WIFI";
const char* WIFI_PASSWORD = "SENHA_DA_SUA_REDE_WIFI";
const char* MQTT_BROKER = "broker.hivemq.com";
const char* VAGA_ID = "Vaga-01"; // ID único para esta vaga

// --- PINOS ---
const int PIN_TRIG = 5;
const int PIN_ECHO = 18;
const int PIN_SOM = 19;

// --- PARÂMETROS ---
const int DISTANCIA_CARRO_CM = 50;

WiFiClient espClient;
PubSubClient client(espClient);
String statusAtual = "";
String ultimoStatusEnviado = "";

void setupWifi() {
  Serial.print("Conectando a ");
  Serial.println(WIFI_SSID);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi conectado!");
}

void reconnectMqtt() {
  while (!client.connected()) {
    Serial.print("Tentando conexão MQTT...");
    if (client.connect("ESP32Client-Vaga01")) {
      Serial.println("Conectado!");
    } else {
      Serial.print("Falhou, rc=");
      Serial.print(client.state());
      Serial.println(" Tentando novamente em 5 segundos");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(PIN_TRIG, OUTPUT);
  pinMode(PIN_ECHO, INPUT);
  pinMode(PIN_SOM, INPUT);
  setupWifi();
  client.setServer(MQTT_BROKER, 1883);
}

void loop() {
  if (!client.connected()) {
    reconnectMqtt();
  }
  client.loop();

  digitalWrite(PIN_TRIG, LOW);
  delayMicroseconds(2);
  digitalWrite(PIN_TRIG, HIGH);
  delayMicroseconds(10);
  digitalWrite(PIN_TRIG, LOW);
  long distancia = pulseIn(PIN_ECHO, HIGH) * 0.034 / 2;
  bool somDetectado = (digitalRead(PIN_SOM) == LOW);

  if (distancia < DISTANCIA_CARRO_CM) {
    statusAtual = somDetectado ? "Movimentacao" : "Ocupada";
  } else {
    statusAtual = "Livre";
  }

  if (statusAtual != ultimoStatusEnviado) {
    StaticJsonDocument<200> doc;
    doc["id"] = VAGA_ID;
    doc["status"] = statusAtual;
    doc["distancia_cm"] = distancia;

    char buffer[256];
    serializeJson(doc, buffer);
    
    client.publish("estacionamento/status_vaga", buffer);
    ultimoStatusEnviado = statusAtual;
    Serial.print("Publicado: ");
    Serial.println(buffer);
  }
  delay(2000);
}
EOF

# -----------------------------------------------------------------------------
# --- 5. ORDEM DE EXECUÇÃO ---
# -----------------------------------------------------------------------------

echo "GUIA DE EXECUÇÃO:"
echo "1. Faça o deploy do Cloudflare Worker com 'wrangler deploy'."
echo "2. Execute a ponte MQTT com 'python bridge.py' em um terminal."
echo "3. Compile e envie o firmware para o ESP32 pela Arduino IDE."
echo "4. Monitore os logs e acesse o painel na URL do seu Worker (ex: https://garagem-worker.seu-subdominio.workers.dev/vagas)."

# --- FIM DO GUIA ---
