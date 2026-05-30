package main

import (
	"log"

	"github.com/zgiai/luas/api/internal/bootstrap"
	"github.com/zgiai/luas/api/internal/wiring"
)

func main() {
	bootstrap.InitLogger()

	application, err := wiring.InitApplication()
	if err != nil {
		log.Fatalf("failed to initialize application: %v", err)
	}

	bootstrap.NewHttpKernel(application).Handle()
}
