shader_type sky;
uniform vec3 zenith : source_color = vec3(0.22, 0.43, 0.60);
uniform vec3 horizon : source_color = vec3(0.83, 0.86, 0.78);
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
float noise(vec2 p) {
	vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void sky() {
	float height = max(EYEDIR.y, 0.0);
	vec3 color = mix(horizon, zenith, pow(height, 0.38));
	vec2 cloud_uv = EYEDIR.xz / max(0.14, height) * 1.4;
	float cloud = noise(cloud_uv) * 0.53 + noise(cloud_uv * 2.3) * 0.28 + noise(cloud_uv * 5.1) * 0.13 + noise(cloud_uv * 11.0) * 0.06;
	float coverage = smoothstep(0.53, 0.73, cloud) * smoothstep(0.02, 0.22, height);
	vec3 cloud_color = mix(vec3(0.73, 0.81, 0.82), vec3(0.99, 0.96, 0.85), smoothstep(0.51, 0.80, cloud));
	color = mix(color, cloud_color, coverage * 0.88);
	float haze = pow(max(0.0, 1.0 - height * 4.0), 4.0);
	COLOR = mix(color, horizon, haze * 0.20);
}
