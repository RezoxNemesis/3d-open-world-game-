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
	float broad = noise(p * 0.085);
	float meadow = broad * 0.6 + noise(p * 0.47) * 0.4;
	float grain = noise(p * 14.0);
	vec3 grass = mix(vec3(0.16, 0.25, 0.15), vec3(0.34, 0.40, 0.23), meadow);
	float soil = smoothstep(0.59, 0.84, noise(p * 0.30 + 71.0));
	grass = mix(grass, vec3(0.36, 0.32, 0.23), soil * 0.48);
	float slope = smoothstep(0.09, 0.35, 1.0 - ground_normal.y);
	vec3 rock = mix(vec3(0.30, 0.35, 0.29), vec3(0.48, 0.49, 0.39), broad * 0.6 + grain * 0.4);
	// Damp ground rounds the pond's rectangular engineering into a natural bank.
	vec2 pond = (p - vec2(-34.0, 0.0)) / vec2(13.2, 17.2);
	float shore = (1.0 - smoothstep(0.92, 1.18, length(pond))) * (1.0 - slope);
	ALBEDO = mix(mix(grass, rock, slope), vec3(0.22, 0.29, 0.20), shore * 0.48) * (0.94 + grain * 0.10);
	ROUGHNESS = 0.94 - shore * 0.16;
}
