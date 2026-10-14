shader_type spatial;
render_mode cull_disabled;
uniform sampler2D silk : source_color, filter_linear_mipmap_anisotropic;
void vertex() {
	float loose = UV.y * UV.y;
	VERTEX.y += (sin(UV.y * 4.0 + TIME * 1.1) * 0.06 + sin(UV.x * 10.0 + TIME * 0.7) * 0.025) * loose;
}
void fragment() {
	ALBEDO = texture(silk, UV).rgb;
	ROUGHNESS = 0.88;
}
