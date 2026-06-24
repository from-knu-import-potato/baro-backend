import "dotenv/config";
import { serve } from "@hono/node-server";
import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { cors } from "hono/cors";
import auth from "./routes/auth.js";
import stores from "./routes/stores.js";
import users from "./routes/users.js";
import menus from "./routes/menus.js";
import ingredients from "./routes/ingredients.js";
import recipesRouter from "./routes/recipes.js";
import ocrRouter from "./routes/ocr.js";
import ordersRouter from "./routes/orders.js";
import dashboardRouter from "./routes/dashboard.js";
import menuCategoriesRouter from "./routes/menu-categories.js";
import themeRouter from "./routes/theme.js";
import closingRouter from "./routes/closing.js";
import orderGuideRouter from "./routes/order-guide.js";
import openRouter from "./routes/open.js";

const app = new OpenAPIHono();

app.use(
  "*",
  cors({
    origin: [
      "http://localhost:5173",
      "https://baro-web.vercel.app",
      "https://qa-baro-web.vercel.app",
    ],
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
  }),
);

app.route("/v1/auth", auth);
app.route("/v1/stores", stores);
app.route("/v1/stores", menus);
app.route("/v1/stores", ingredients);
app.route("/v1/stores", recipesRouter);
app.route("/v1/users", users);
app.route("/v1/stores", ocrRouter);
app.route("/v1/stores", ordersRouter);
app.route("/v1/stores", dashboardRouter);
app.route("/v1/stores", menuCategoriesRouter);
app.route("/v1/stores", themeRouter);
app.route("/v1/stores", closingRouter);
app.route("/v1/stores", orderGuideRouter);
app.route("/v1/stores", openRouter);

app.get("/", (c) => c.json({ success: true, data: { message: "BARO API" } }));

// OpenAPI spec & Swagger UI
app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  bearerFormat: "JWT",
  description: "JWT Access Token (Authorization: Bearer <token>)",
});

app.doc("/openapi.json", {
  openapi: "3.0.0",
  info: {
    title: "BARO API",
    version: "1.2.0",
    description: "BARO 가게 운영 SaaS — OCR·AI 기반 통합 가게 운영 플랫폼 API",
  },
  servers: [
    { url: "http://localhost:3000", description: "개발 서버" },
    {
      url: "https://baro-backend-production-c908.up.railway.app",
      description: "프로덕션 서버",
    },
  ],
});

app.get("/doc", swaggerUI({ url: "/openapi.json" }));

serve(
  {
    fetch: app.fetch,
    port: Number(process.env.PORT ?? 3000),
  },
  (info) => {
    console.log(`Server running on http://localhost:${info.port}`);
  },
);
