shader_type spatial;
uniform vec4 stone_color : source_color = vec4(0.57, 0.56, 0.48, 1.0);
uniform bool paving = true;
varying vec3 world_position;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i), hash(i + vec2(1,0)), f.x), mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), f.x), f.y);
}
void vertex() { world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; }
void fragment() {
	vec2 p = world_position.xz;
	float grain = noise(p * 26.0) * 0.08 + noise(p * 3.0) * 0.12;
	vec3 color = stone_color.rgb * (0.84 + grain);
	if (paving) {
		vec2 tile = vec2(p.x / 1.35 + mod(floor(p.y / 0.9), 2.0) * 0.5, p.y / 0.9);
		vec2 edge = min(fract(tile), 1.0 - fract(tile));
		float joint = smoothstep(0.007, 0.028, min(edge.x, edge.y));
		color *= mix(0.24, 0.91 + hash(floor(tile)) * 0.15, joint);
		float moss = smoothstep(0.61, 0.79, noise(p * 0.32)) * (1.0 - smoothstep(0.02, 0.12, min(edge.x, edge.y)));
		color = mix(color, vec3(0.22, 0.29, 0.15), moss * 0.5);
	}
	ALBEDO = color;
	ROUGHNESS = 0.82;
}
