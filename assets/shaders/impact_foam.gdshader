shader_type spatial;
render_mode cull_disabled;
varying vec3 impact_position;
void vertex() {
	impact_position = (MODEL_MATRIX * vec4(VERTEX,1.0)).xyz;
	VERTEX.y += sin(TIME * 1.7 + VERTEX.x * 8.0 + VERTEX.z * 7.0) * 0.008;
}
void fragment() {
	float broken = sin(impact_position.x * 18.0 + impact_position.z * 22.0 + TIME * 2.3);
	float froth = 0.68 + broken * 0.13 + sin(impact_position.z * 47.0 - TIME * 4.2) * 0.09;
	ALBEDO = mix(vec3(0.38,0.61,0.51), vec3(0.83,0.92,0.81), froth);
	ROUGHNESS = 0.44;
	SPECULAR = 0.38;
}
