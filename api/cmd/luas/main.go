package main

import (
	"os"

	"github.com/zgiai/luas/api/internal/infra/console"
	"github.com/zgiai/luas/api/internal/infra/console/commands"
)

var Version = "dev"

func main() {
	app := console.New("luas", Version)
	commands.RegisterManifests(app, commands.DefaultManifests(Version)...)

	if err := app.Run(os.Args); err != nil {
		os.Exit(1)
	}
}
