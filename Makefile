.PHONY: build run dev-backend dev-frontend test gen-types build-web docker clean

## Go binárka (bez CGO)
build:
	CGO_ENABLED=0 go build -o bin/tilecraft ./cmd/server/

## Backend na :8080 s demo daty (SQLite tilecraft.db)
run: build
	TILECRAFT_SEED_DEMO=1 ./bin/tilecraft

dev-backend:
	TILECRAFT_SEED_DEMO=1 go run ./cmd/server/

## Vite na :5173 (proxuje /api → :8080)
dev-frontend:
	cd web && npm run dev

## Go testy + typecheck a testy frontendu
test:
	go vet ./...
	go test ./... -count=1
	@if [ -d web/node_modules ]; then cd web && npm run typecheck && npm test; fi

## Přegeneruje web/src/api/schema.gen.ts z OpenAPI — po každé změně API
gen-types:
	go run ./cmd/gen-schema > web/openapi.json
	cd web && npx openapi-typescript openapi.json -o src/api/schema.gen.ts
	rm web/openapi.json

build-web:
	cd web && npm run build

docker:
	docker compose up -d --build

clean:
	rm -rf bin/ web/dist/ tilecraft.db*
