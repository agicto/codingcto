package execution

import (
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/zgiai/luas/api/pkg/response"
)

const localRuntimeToken = "local-runtime-token"

func LocalRuntimeToken() string {
	return localRuntimeToken
}

// RuntimeTokenAuth authenticates local executor runtimes without requiring a
// user JWT. Runtimes are machine actors that only need heartbeat, claim, event,
// and result submission access.
func RuntimeTokenAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		token := bearerToken(c.GetHeader("Authorization"))
		if token == "" {
			response.Error(c, http.StatusUnauthorized, "Runtime authorization header required")
			c.Abort()
			return
		}

		expected := expectedRuntimeToken()
		if expected == "" {
			response.Error(c, http.StatusUnauthorized, "Runtime token is not configured")
			c.Abort()
			return
		}
		if token != expected {
			response.Error(c, http.StatusUnauthorized, "Invalid runtime token")
			c.Abort()
			return
		}

		c.Set("runtimeTokenAuthenticated", true)
		c.Next()
	}
}

func expectedRuntimeToken() string {
	if value := strings.TrimSpace(os.Getenv("SPECFORGE_RUNTIME_TOKEN")); value != "" {
		return value
	}
	if value := strings.TrimSpace(os.Getenv("CODINGCTO_RUNTIME_TOKEN")); value != "" {
		return value
	}
	if !strings.EqualFold(strings.TrimSpace(os.Getenv("APP_ENV")), "production") {
		return localRuntimeToken
	}
	return ""
}

func bearerToken(authHeader string) string {
	parts := strings.SplitN(strings.TrimSpace(authHeader), " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}
