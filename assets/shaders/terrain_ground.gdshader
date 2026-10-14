shader_type spatial;
varying vec3 ground_position;
varying vec3 ground_normal;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
void vertex() {
	ground_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	ground_normal = normalize(MODEL_NORMAL_MATRIX * NORMAL);
}
void fragment() {
	vec2 p = ground_position.xz;
	float meadow = noise(p * 0.12) * 0.65 + noise(p * 0.63) * 0.35;
	float grain = noise(p * 16.0);
	vec3 grass = mix(vec3(0.19, 0.27, 0.16), vec3(0.40, 0.45, 0.24), meadow);
	float bare = smoothstep(0.62, 0.85, noise(p * 0.27 + 71.0));
	grass = mix(grass, vec3(0.43, 0.37, 0.26), bare * 0.65);
	float steep = smoothstep(0.12, 0.40, 1.0 - ground_normal.y);
	vec3 rock = mix(vec3(0.38, 0.40, 0.34), vec3(0.60, 0.58, 0.45), grain);
	ALBEDO = mix(grass, rock, steep) * (0.88 + grain * 0.18);
	ROUGHNESS = 0.95;
}
