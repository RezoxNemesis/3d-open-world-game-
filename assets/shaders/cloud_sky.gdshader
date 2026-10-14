shader_type sky;
uniform vec3 zenith : source_color = vec3(0.20, 0.41, 0.58);
uniform vec3 horizon : source_color = vec3(0.80, 0.85, 0.79);
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void sky() {
	float height = max(EYEDIR.y, 0.0);
	vec3 color = mix(horizon, zenith, pow(height, 0.45));
	vec2 cloud_uv = EYEDIR.xz / max(0.16, height) * 2.0;
	float cloud = noise(cloud_uv) * 0.57 + noise(cloud_uv * 2.3) * 0.28 + noise(cloud_uv * 5.1) * 0.15;
	cloud = smoothstep(0.51, 0.69, cloud) * smoothstep(0.03, 0.24, height);
	color = mix(color, vec3(0.95, 0.94, 0.85), cloud * 0.82);
	COLOR = color;
}
