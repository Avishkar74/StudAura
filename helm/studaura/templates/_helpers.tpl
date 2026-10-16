{{- define "studaura.name" -}}{{ .Chart.Name }}{{- end }}

{{- define "studaura.labels" -}}
app.kubernetes.io/name: {{ include "studaura.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end }}

{{- define "studaura.selector" -}}
app.kubernetes.io/name: {{ include "studaura.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/* Image reference; fails the render when no tag was given. */}}
{{- define "studaura.image" -}}
{{- $root := index . 0 -}}
{{- $component := index . 1 -}}
{{- $tag := required "image.tag is required: pass the commit SHA with --set image.tag=<sha>" $root.Values.image.tag -}}
{{ $root.Values.image.registry }}/{{ $root.Values.image.owner }}/studaura-{{ $component }}:{{ $tag }}
{{- end }}
