shader_type spatial;
render_mode cull_disabled;
uniform vec4 water_color : source_color = vec4(0.08, 0.42, 0.41, 1.0);
uniform bool falling = false;
varying vec3 world_position;
void vertex() {
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	if (!falling) { VERTEX.y += sin(world_position.x * 1.9 + TIME * 0.8) * cos(world_position.z * 1.4 + TIME * 0.5) * 0.025; }
}
void fragment() {
	vec2 p = falling ? vec2(UV.x * 14.0, UV.y * 8.0 - TIME * 1.8) : world_position.xz;
	float ripple = sin(p.x * 3.1 + p.y * 2.3 + TIME) * sin(p.x * 2.6 - p.y * 3.7 + TIME * 0.7);
	float lines = pow(max(0.0, sin(p.x * 13.0 + sin(p.y * 3.0 + TIME))), 12.0);
	vec3 color = mix(water_color.rgb, vec3(0.49, 0.73, 0.65), ripple * 0.12 + 0.14);
	if (falling) {
		float thread = sin(UV.x * 157.0 + sin(UV.y * 17.0 - TIME * 3.0) * 0.3) * 0.5 + 0.5;
		float stream = sin(UV.y * 73.0 - TIME * 11.0 + UV.x * 28.0) * 0.08;
		color = mix(vec3(0.26, 0.42, 0.45), vec3(0.70, 0.83, 0.84), thread * 0.55 + 0.32 + stream);
	}
	ALBEDO = color;
	ROUGHNESS = falling ? 0.45 : 0.14;
	METALLIC = 0.22;
	SPECULAR = 0.8;
	NORMAL_MAP = vec3(0.5 + ripple * 0.09, 0.5 + sin(p.y * 4.0 + TIME) * 0.08, 1.0);
	if (falling) { NORMAL_MAP = vec3(0.5, 0.5, 1.0); }
}
