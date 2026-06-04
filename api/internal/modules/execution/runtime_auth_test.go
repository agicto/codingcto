package execution

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestRuntimeTokenAuthAllowsDevelopmentDefaultToken(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("SPECFORGE_RUNTIME_TOKEN", "")
	t.Setenv("CODINGCTO_RUNTIME_TOKEN", "")

	status := exerciseRuntimeTokenAuth("Bearer " + LocalRuntimeToken())

	require.Equal(t, http.StatusOK, status)
}

func TestRuntimeTokenAuthPrefersConfiguredToken(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("SPECFORGE_RUNTIME_TOKEN", "runtime-secret")
	t.Setenv("CODINGCTO_RUNTIME_TOKEN", "")

	require.Equal(t, http.StatusOK, exerciseRuntimeTokenAuth("Bearer runtime-secret"))
	require.Equal(t, http.StatusUnauthorized, exerciseRuntimeTokenAuth("Bearer "+LocalRuntimeToken()))
}

func TestRuntimeTokenAuthRequiresConfiguredTokenInProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("SPECFORGE_RUNTIME_TOKEN", "")
	t.Setenv("CODINGCTO_RUNTIME_TOKEN", "")

	status := exerciseRuntimeTokenAuth("Bearer " + LocalRuntimeToken())

	require.Equal(t, http.StatusUnauthorized, status)
}

func exerciseRuntimeTokenAuth(authHeader string) int {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.GET("/runtime-only", RuntimeTokenAuth(), func(c *gin.Context) {
		c.Status(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/runtime-only", nil)
	if authHeader != "" {
		req.Header.Set("Authorization", authHeader)
	}
	rec := httptest.NewRecorder()
	r.ServeHTTP(rec, req)
	return rec.Code
}
