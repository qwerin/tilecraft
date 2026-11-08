package api

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"mime"
	"mime/multipart"
	"net/http"
	"net/textproto"
	"net/url"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// MCP tools for files (SPEC §9): showing an attachment to the assistant and
// uploading a small file. Like the other tools they go through the API router
// (the multipart upload and download endpoints) with the caller's token.

// mcpMaxFile bounds a file passed through MCP (base64 in the JSON-RPC message).
const mcpMaxFile = 8 << 20

// mcpFileSources are the download endpoints by kind.
var mcpFileSources = map[string]string{
	"attachment": "/attachments/%d?inline=1", // photos and files of jobs
}

// mcpFileTargets are the upload endpoints by target.
var mcpFileTargets = map[string]string{
	"job": "/jobs/%d/attachments",
}

func mcpKeys(m map[string]string) []any {
	var out []any
	for _, k := range []string{"attachment", "job"} {
		if _, ok := m[k]; ok {
			out = append(out, k)
		}
	}
	return out
}

func (s *server) addMCPFileTools(srv *mcp.Server, router http.Handler) {
	account := map[string]any{"type": "string", "description": "Account slug (see list_accounts)"}
	id := map[string]any{"type": "integer", "minimum": 1}
	srv.AddTool(&mcp.Tool{
		Name: "get_attachment", Title: "Zobrazit přílohu",
		Description: "Show a file: an image comes back as an image, a PDF as an embedded resource. kind attachment = photo or file of a job " +
			"(ids in get_job). Files over 8 MB: open them in the web app.",
		InputSchema: map[string]any{"type": "object", "additionalProperties": false, "required": []any{"account", "kind", "id"},
			"properties": map[string]any{"account": account, "kind": map[string]any{"type": "string", "enum": mcpKeys(mcpFileSources)}, "id": id}},
		Annotations: &mcp.ToolAnnotations{Title: "Zobrazit přílohu", ReadOnlyHint: true, IdempotentHint: true, DestructiveHint: new(false), OpenWorldHint: new(false)},
	}, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var in struct {
			Account string `json:"account"`
			Kind    string `json:"kind"`
			ID      uint   `json:"id"`
		}
		if err := json.Unmarshal(req.Params.Arguments, &in); err != nil || in.Account == "" || in.ID == 0 {
			return mcpError("account, kind and id required"), nil
		}
		src, ok := mcpFileSources[in.Kind]
		if !ok {
			return mcpError("kind: attachment"), nil
		}
		rec, err := mcpDo(ctx, router, req, http.MethodGet, "/api/accounts/"+url.PathEscape(in.Account)+fmt.Sprintf(src, in.ID), http.NoBody, "application/json")
		if err != nil {
			return mcpError("invalid request: " + err.Error()), nil
		}
		if rec.status >= 400 {
			return mcpError(fmt.Sprintf("HTTP %d: %s", rec.status, strings.TrimSpace(rec.body.String()))), nil
		}
		ct := strings.TrimSpace(strings.Split(rec.header.Get("Content-Type"), ";")[0])
		data := rec.body.Bytes()
		name := ""
		if _, params, err := mime.ParseMediaType(rec.header.Get("Content-Disposition")); err == nil {
			name = params["filename"]
		}
		if len(data) > mcpMaxFile {
			return mcpError(fmt.Sprintf("%s is %d MB, too large for the assistant; open it in the web app", name, len(data)>>20)), nil
		}
		info := &mcp.TextContent{Text: fmt.Sprintf("%s (%s, %d kB)", name, ct, len(data)>>10)}
		switch {
		case strings.HasPrefix(ct, "image/"):
			return &mcp.CallToolResult{Content: []mcp.Content{info, &mcp.ImageContent{Data: data, MIMEType: ct}}}, nil
		case strings.HasPrefix(ct, "text/") || ct == "application/xml" || ct == "application/json":
			return &mcp.CallToolResult{Content: []mcp.Content{info, &mcp.TextContent{Text: string(data)}}}, nil
		default:
			uri := fmt.Sprintf("tilecraft://%s/%s/%d", in.Account, in.Kind, in.ID)
			return &mcp.CallToolResult{Content: []mcp.Content{info, &mcp.EmbeddedResource{Resource: &mcp.ResourceContents{URI: uri, MIMEType: ct, Blob: data}}}}, nil
		}
	})

	srv.AddTool(&mcp.Tool{
		Name: "upload_attachment", Title: "Nahrát přílohu",
		Description: "Attach a file (base64, max 8 MB) the user gave you to a job: target job = photo of the site, the sketch of the measurement, " +
			"a document. Files cannot be deleted through these tools.",
		InputSchema: map[string]any{"type": "object", "additionalProperties": false, "required": []any{"account", "target", "id", "filename", "content_base64"},
			"properties": map[string]any{
				"account":        account,
				"target":         map[string]any{"type": "string", "enum": mcpKeys(mcpFileTargets)},
				"id":             id,
				"filename":       map[string]any{"type": "string", "minLength": 1, "maxLength": 200, "description": "With the extension, e.g. uctenka.jpg"},
				"content_type":   map[string]any{"type": "string", "description": "e.g. image/jpeg, application/pdf; empty = from the extension"},
				"content_base64": map[string]any{"type": "string", "description": "File content in base64"},
			}},
		Annotations: &mcp.ToolAnnotations{Title: "Nahrát přílohu", DestructiveHint: new(false), OpenWorldHint: new(false)},
	}, func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		var in struct {
			Account     string `json:"account"`
			Target      string `json:"target"`
			ID          uint   `json:"id"`
			Filename    string `json:"filename"`
			ContentType string `json:"content_type"`
			Content     string `json:"content_base64"`
		}
		if err := json.Unmarshal(req.Params.Arguments, &in); err != nil || in.Account == "" || in.ID == 0 || in.Filename == "" {
			return mcpError("account, target, id, filename and content_base64 required"), nil
		}
		dst, ok := mcpFileTargets[in.Target]
		if !ok {
			return mcpError("target: job"), nil
		}
		data, err := base64.StdEncoding.DecodeString(strings.TrimSpace(in.Content))
		if err != nil {
			return mcpError("content_base64 is not valid base64"), nil
		}
		if len(data) == 0 || len(data) > mcpMaxFile {
			return mcpError("the file must have 1 B – 8 MB"), nil
		}
		body := &bytes.Buffer{}
		mw := multipart.NewWriter(body)
		h := textproto.MIMEHeader{}
		h.Set("Content-Disposition", fmt.Sprintf(`form-data; name="file"; filename=%s`, strconv.Quote(filepath.Base(in.Filename))))
		if in.ContentType != "" {
			h.Set("Content-Type", in.ContentType)
		}
		part, _ := mw.CreatePart(h)
		_, _ = part.Write(data)
		_ = mw.Close()
		rec, err := mcpDo(ctx, router, req, http.MethodPost, "/api/accounts/"+url.PathEscape(in.Account)+fmt.Sprintf(dst, in.ID), body, mw.FormDataContentType())
		if err != nil {
			return mcpError("invalid request: " + err.Error()), nil
		}
		return mcpResult(rec), nil
	})
}
