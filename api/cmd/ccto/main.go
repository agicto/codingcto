package main

import (
	"os"

	"github.com/zgiai/luas/api/internal/runtimecli"
)

func main() {
	os.Exit(runtimecli.Run("ccto", "ccto/0.1"))
}
