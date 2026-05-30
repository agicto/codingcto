package support

import (
	"fmt"

	"github.com/fatih/color"
)

// PrintBanner prints the CodingCTO startup banner to console.
func PrintBanner(version string) {
	bannerColor := color.New(color.FgCyan, color.Bold)
	secondaryColor := color.New(color.FgHiBlue)

	bannerColor.Println("CodingCTO")
	secondaryColor.Printf("GitHub-native PRD-to-PR API %s\n", version)
	fmt.Println()
}
