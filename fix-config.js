import fs from "node:fs";

fs.writeFileSync(
  ".env",
  `DATABASE_URL=postgresql://postgres:postgres@localhost:5433/sla_tracker?schema=public
JWT_SECRET=dev-secret-do-not-use-in-production
BUSINESS_TIMEZONE=Asia/Kolkata
`
);

fs.writeFileSync(
  "docker-compose.yml",
  `services:
  postgres:
    image: postgres:16-alpine
    container_name: sla-tracker-db
    restart: unless-stopped
    ports:
      - "5433:5432"
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: sla_tracker
    volumes:
      - pgdata:/var/lib/postgresql/data

volumes:
  pgdata:
`
);

console.log("✅ Config files (.env & docker-compose.yml) updated perfectly!");