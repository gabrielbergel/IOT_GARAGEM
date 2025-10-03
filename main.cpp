#include <Arduino.h>
#include <WiFi.h>
#include <PubSubClient.h>
#include <NewPing.h>
#include <ArduinoJson.h>

// --- IDENTIFICAÇÃO ÚNICA DA VAGA ---
const char* VAGA_ID = "Vaga-01"; // <-- MUDE ESTE VALOR PARA CADA ESP32!

// --- CONFIGURAÇÕES DE REDE E MQTT ---
const char* SSID = "AMF";
const char* PASSWORD = "amf@2025";
const char* MQTT_BROKER = "test.mosquitto.org";

// --- MUDANÇA: DOIS TÓPICOS DIFERENTES ---
// Tópico para enviar apenas os dados de distância
const char* MQTT_TOPIC_DISTANCIA = "garagem/vagas/distancia";
// Tópico para enviar apenas os dados de ruído
const char* MQTT_TOPIC_RUIDO = "garagem/vagas/ruido";
// Tópico para enviar o status consolidado (LIVRE, OCUPADA, etc.)
const char* MQTT_TOPIC_STATUS = "garagem/vagas/status";


// --- MAPEAMENTO DOS PINOS (Sem alterações) ---
const int TRIGGER_PIN = 15;
const int ECHO_PIN = 4;
const int SOUND_AO_PIN = 34;
const int LED_VERDE_PIN = 25;
const int LED_AMARELO_PIN = 33;
const int LED_VERMELHO_PIN = 32;

// --- PARÂMETROS DE LÓGICA (Sem alterações) ---
const int DISTANCIA_VAGA_OCUPADA = 5;
const int LIMIAR_RUIDO_MOTOR = 100;
const int MINIMA_VARIACAO_DISTANCIA = 10;

// --- CLIENTES E OBJETOS ---
WiFiClient espClient;
PubSubClient client(espClient);
NewPing sonar(TRIGGER_PIN, ECHO_PIN, 200);
StaticJsonDocument<128> jsonDoc; // JSON pode ser menor, pois as mensagens são separadas
int distanciaAnterior = 0;
String statusVaga = "Iniciando";
String statusVagaAnterior = ""; // Variável para enviar o status apenas quando ele mudar

// Função para reconectar ao MQTT (Sem alterações)
void reconnect() {
  while (!client.connected()) {
    Serial.print("Tentando conectar ao Broker MQTT...");
    String clientId = "ESP32-Garagem-";
    clientId += VAGA_ID;
    if (client.connect(clientId.c_str())) {
      Serial.println("Conectado!");
    } else {
      Serial.print("Falhou, rc=");
      Serial.print(client.state());
      Serial.println(" | Tentando novamente em 5 segundos");
      delay(5000);
    }
  }
}

void setup() {
  Serial.begin(115200);
  pinMode(LED_VERDE_PIN, OUTPUT);
  pinMode(LED_AMARELO_PIN, OUTPUT);
  pinMode(LED_VERMELHO_PIN, OUTPUT);
  WiFi.begin(SSID, PASSWORD);
  Serial.print("Conectando ao Wi-Fi ");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWi-Fi conectado!");
  client.setServer(MQTT_BROKER, 1883);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  int distanciaAtual = sonar.ping_cm();
  if (distanciaAtual == 0) distanciaAtual = 200;
  
  int nivelDeRuido = analogRead(SOUND_AO_PIN);
  int variacaoDistancia = abs(distanciaAtual - distanciaAnterior);
  
  // A lógica de controle dos LEDs e definição do statusVaga permanece a mesma
  if (distanciaAtual > DISTANCIA_VAGA_OCUPADA) {
    statusVaga = "LIVRE";
    digitalWrite(LED_VERDE_PIN, HIGH);
    digitalWrite(LED_AMARELO_PIN, LOW);
    digitalWrite(LED_VERMELHO_PIN, LOW);
  } else {
    if (nivelDeRuido > LIMIAR_RUIDO_MOTOR && variacaoDistancia > MINIMA_VARIACAO_DISTANCIA) {
      statusVaga = "MOVIMENTACAO";
      digitalWrite(LED_VERDE_PIN, LOW);
      digitalWrite(LED_AMARELO_PIN, HIGH);
      digitalWrite(LED_VERMELHO_PIN, LOW);
    } else {
      statusVaga = "OCUPADA";
      digitalWrite(LED_VERDE_PIN, LOW);
      digitalWrite(LED_AMARELO_PIN, LOW);
      digitalWrite(LED_VERMELHO_PIN, HIGH);
    }
  }
  distanciaAnterior = distanciaAtual;

  // --- MUDANÇA: PUBLICAÇÃO MQTT SEPARADA ---
  static unsigned long lastPublishTime = 0;
  if (millis() - lastPublishTime > 5000) {
    lastPublishTime = millis();

    Serial.println("--------------------------------");
    // 1. Monta e publica o JSON da DISTÂNCIA
    jsonDoc.clear();
    jsonDoc["id"] = VAGA_ID;
    jsonDoc["distancia_cm"] = distanciaAtual;
    char jsonBufferDistancia[128];
    serializeJson(jsonDoc, jsonBufferDistancia);
    client.publish(MQTT_TOPIC_DISTANCIA, jsonBufferDistancia);
    Serial.printf("Publicado em '%s': %s\n", MQTT_TOPIC_DISTANCIA, jsonBufferDistancia);

    // 2. Monta e publica o JSON do RUÍDO
    jsonDoc.clear();
    jsonDoc["id"] = VAGA_ID;
    jsonDoc["nivel_ruido_raw"] = nivelDeRuido;
    char jsonBufferRuido[128];
    serializeJson(jsonDoc, jsonBufferRuido);
    client.publish(MQTT_TOPIC_RUIDO, jsonBufferRuido);
    Serial.printf("Publicado em '%s': %s\n", MQTT_TOPIC_RUIDO, jsonBufferRuido);
  }

  // --- MUDANÇA: Publica o STATUS apenas quando ele mudar ---
  if (statusVaga != statusVagaAnterior) {
    jsonDoc.clear();
    jsonDoc["id"] = VAGA_ID;
    jsonDoc["status"] = statusVaga;
    char jsonBufferStatus[128];
    serializeJson(jsonDoc, jsonBufferStatus);
    client.publish(MQTT_TOPIC_STATUS, jsonBufferStatus);
    Serial.printf("Publicado em '%s': %s\n", MQTT_TOPIC_STATUS, jsonBufferStatus);
    statusVagaAnterior = statusVaga; // Atualiza o status anterior
  }

  delay(200);
}
