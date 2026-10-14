shader_type spatial;
render_mode cull_disabled;
uniform float wind_strength = 0.045;
uniform bool blossom = false;
varying vec3 leaf_position;
varying vec4 leaf_color;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
void vertex() {
	leaf_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	leaf_color = COLOR;
	float wind = sin(leaf_position.x * 0.33 + TIME * 1.1) * cos(leaf_position.z * 0.21 + TIME * 0.7);
	VERTEX.x += wind * max(VERTEX.y, 0.0) * wind_strength;
}
void fragment() {
	float mottling = hash(floor(leaf_position * (blossom ? 12.0 : 7.0)));
	vec3 color = leaf_color.rgb * (0.82 + mottling * 0.26);
	if (blossom) { color = mix(color, vec3(0.98, 0.82, 0.76), smoothstep(0.80, 0.97, mottling) * 0.40); }
	// Leaf holes break continuous rounded crown surfaces into a lace-like canopy.
	ALPHA = blossom ? smoothstep(0.18, 0.32, mottling) : 1.0;
	ALPHA_SCISSOR_THRESHOLD = 0.5;
	ALBEDO = color;
	ROUGHNESS = 0.88;
	SPECULAR = 0.18;
}
