import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpExchange;

import java.io.*;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.List;

public class InventoryServer {

    // Component Data Model
    static class Component {
        String id;
        String name;
        String category;
        int quantity;

        public Component(String id, String name, String category, int quantity) {
            this.id = id;
            this.name = name;
            this.category = category;
            this.quantity = quantity;
        }

        // Manual JSON conversion since we are using strictly standard Java
        public String toJson() {
            return String.format("{\"id\":\"%s\", \"name\":\"%s\", \"category\":\"%s\", \"quantity\":%d}", 
                    id, name, category, quantity);
        }
    }

    // In-memory Database
    private static List<Component> inventory = new ArrayList<>();
    private static int idCounter = 1004;

    public static void main(String[] args) throws IOException {
        // Pre-load some baseline inventory items
        inventory.add(new Component("CMP-1001", "ESP32 Microcontroller", "Processor/MCU", 45));
        inventory.add(new Component("CMP-1002", "Anemometer", "Sensor", 8));
        inventory.add(new Component("CMP-1003", "Silicon Quads", "Power/Silicon", 120));

        // Start HTTP Server on port 8080
        HttpServer server = HttpServer.create(new InetSocketAddress(8080), 0);
        
        server.createContext("/", new StaticFileHandler());
        server.createContext("/api/components", new ApiHandler());
        
        server.setExecutor(null); 
        server.start();
        System.out.println("System online. Access the dashboard at: http://localhost:8080");
    }

    // Handles HTML/CSS serving
    static class StaticFileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String path = exchange.getRequestURI().getPath();
            if (path.equals("/")) path = "/index.html";
            
            File file = new File("." + path);
            if (file.exists()) {
                byte[] bytes = Files.readAllBytes(Paths.get(file.getPath()));
                if (path.endsWith(".css")) exchange.getResponseHeaders().set("Content-Type", "text/css");
                else if (path.endsWith(".html")) exchange.getResponseHeaders().set("Content-Type", "text/html");
                
                exchange.sendResponseHeaders(200, bytes.length);
                OutputStream os = exchange.getResponseBody();
                os.write(bytes);
                os.close();
            } else {
                exchange.sendResponseHeaders(404, -1);
            }
        }
    }

    // Handles API requests for tracking logic
    static class ApiHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("GET".equals(exchange.getRequestMethod())) {
                // Return current inventory
                StringBuilder jsonResponse = new StringBuilder("[");
                for (int i = 0; i < inventory.size(); i++) {
                    jsonResponse.append(inventory.get(i).toJson());
                    if (i < inventory.size() - 1) jsonResponse.append(",");
                }
                jsonResponse.append("]");
                
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(200, jsonResponse.length());
                OutputStream os = exchange.getResponseBody();
                os.write(jsonResponse.toString().getBytes());
                os.close();

            } else if ("POST".equals(exchange.getRequestMethod())) {
                // Parse new component manually from basic string payload
                InputStreamReader isr = new InputStreamReader(exchange.getRequestBody(), "utf-8");
                BufferedReader br = new BufferedReader(isr);
                String payload = br.readLine(); // Reads the JSON string sent by JS

                // Very rudimentary parsing to avoid external JSON dependencies
                String name = extractJsonValue(payload, "name");
                String category = extractJsonValue(payload, "category");
                int quantity = Integer.parseInt(extractJsonValue(payload, "quantity").replaceAll("[^0-9]", ""));

                inventory.add(new Component("CMP-" + (idCounter++), name, category, quantity));
                
                exchange.sendResponseHeaders(201, -1);
            }
        }

        // Helper string parser
        private String extractJsonValue(String json, String key) {
            String searchStr = "\"" + key + "\":";
            int start = json.indexOf(searchStr);
            if (start == -1) return "";
            start += searchStr.length();
            int end;
            if (json.charAt(start) == '\"') {
                start++; // Skip opening quote
                end = json.indexOf("\"", start);
            } else {
                end = json.indexOf(",", start);
                if (end == -1) end = json.indexOf("}", start);
            }
            return json.substring(start, end).trim();
        }
    }
}