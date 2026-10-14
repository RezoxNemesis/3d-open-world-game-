shader_type spatial;
render_mode cull_disabled;
uniform vec4 water_color : source_color = vec4(0.08, 0.38, 0.36, 1.0);
uniform bool falling = false;
varying vec3 world_position;
void vertex() {
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	if (!falling) { VERTEX.y += sin(world_position.x * 1.4 + TIME * 0.8) * cos(world_position.z * 1.2 + TIME * 0.5) * 0.020; }
}
void fragment() {
	vec2 p = falling ? vec2(UV.x * 14.0, UV.y * 8.0 - TIME * 1.8) : world_position.xz;
	float ripple = sin(p.x * 3.1 + p.y * 2.3 + TIME) * sin(p.x * 2.6 - p.y * 3.7 + TIME * 0.7);
	float broad = sin(p.x * 0.7 + p.y * 0.4 + TIME * 0.22) * 0.5 + 0.5;
	vec3 color = mix(water_color.rgb, vec3(0.31, 0.60, 0.51), broad * 0.28 + ripple * 0.06);
	float glint = pow(max(0.0, sin(p.x * 4.4 + p.y * 3.6 + TIME * 0.5)), 22.0);
	color += vec3(0.36, 0.42, 0.29) * glint * 0.10;
	if (falling) {
		float thread = sin(UV.x * 89.0 + sin(UV.y * 17.0 - TIME * 3.0) * 0.5) * 0.5 + 0.5;
		float stream = sin(UV.y * 41.0 - TIME * 9.0 + UV.x * 21.0) * 0.045;
		float edges = smoothstep(0.0, 0.12, UV.x) * smoothstep(1.0, 0.88, UV.x);
		color = mix(vec3(0.29, 0.50, 0.47), vec3(0.87, 0.95, 0.91), (thread * 0.30 + 0.62 + stream) * edges);
	}
	ALBEDO = color;
	ROUGHNESS = falling ? 0.43 : 0.19;
	METALLIC = 0.12;
	SPECULAR = 0.72;
	NORMAL_MAP = vec3(0.5 + ripple * 0.05, 0.5 + sin(p.y * 4.0 + TIME) * 0.045, 1.0);
	if (falling) { NORMAL_MAP = vec3(0.5, 0.5, 1.0); }
}
