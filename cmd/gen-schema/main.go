// Command gen-schema prints the OpenAPI document (for web/src/api/schema.gen.ts).
package main

import (
	"encoding/json"
	"os"

	"github.com/qwerin/tilecraft/internal/api"
	"github.com/qwerin/tilecraft/internal/config"
)

func main() {
	_, a := api.New(nil, config.Config{}, api.Deps{})
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	if err := enc.Encode(a.OpenAPI()); err != nil {
		panic(err)
	}
}
