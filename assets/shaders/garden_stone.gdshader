shader_type spatial;
uniform vec4 stone_color : source_color = vec4(0.60, 0.59, 0.51, 1.0);
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
	float grain = noise(p * 21.0) * 0.09 + noise(p * 2.0) * 0.10;
	vec3 color = stone_color.rgb * (0.86 + grain);
	if (paving) {
		vec2 tile = vec2(p.x / 1.70 + mod(floor(p.y / 1.10), 2.0) * 0.5, p.y / 1.10);
		vec2 edge = min(fract(tile), 1.0 - fract(tile));
		float joint = smoothstep(0.003, 0.013, min(edge.x, edge.y));
		color *= mix(0.50, 0.92 + hash(floor(tile)) * 0.14, joint);
		float moss = smoothstep(0.60, 0.78, noise(p * 0.26)) * (1.0 - smoothstep(0.01, 0.06, min(edge.x, edge.y)));
		color = mix(color, vec3(0.24, 0.32, 0.18), moss * 0.48);
	}
	ALBEDO = color;
	ROUGHNESS = 0.83;
	SPECULAR = 0.22;
}
