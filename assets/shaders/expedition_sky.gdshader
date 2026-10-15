shader_type sky;
uniform vec3 zenith : source_color = vec3(0.21, 0.39, 0.56);
uniform vec3 horizon : source_color = vec3(0.70, 0.80, 0.82);
uniform vec3 sun_direction = vec3(0.6, 0.6, -0.32);
uniform vec3 sun_color : source_color = vec3(1.0, 0.86, 0.65);
uniform float night : hint_range(0.0, 1.0) = 0.0;
uniform float cloud_cover : hint_range(0.0, 1.0) = 0.22;
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise21(vec2 p) {
	vec2 i = floor(p); vec2 f = fract(p); f = f * f * (3.0 - 2.0 * f);
	return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
		mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
}
void sky() {
	vec3 direction = normalize(EYEDIR);
	float height = max(direction.y, 0.0);
	vec3 color = mix(horizon, zenith, pow(height, 0.43));
	vec2 cloud_uv = direction.xz / max(0.13, height) * 1.5 + vec2(TIME * 0.002, 0.0);
	float cloud = noise21(cloud_uv) * 0.52 + noise21(cloud_uv * 2.3) * 0.27
		+ noise21(cloud_uv * 5.1) * 0.14 + noise21(cloud_uv * 11.0) * 0.07;
	float coverage = smoothstep(0.60 - cloud_cover * 0.23, 0.79 - cloud_cover * 0.15, cloud)
		* smoothstep(0.015, 0.18, height);
	vec3 cloud_color = mix(vec3(0.56, 0.65, 0.70), vec3(1.0, 0.95, 0.84), cloud);
	cloud_color = mix(cloud_color, vec3(0.10, 0.14, 0.22), night * 0.92);
	color = mix(color, cloud_color, coverage * 0.87);
	vec2 celestial_uv = vec2(atan(direction.x, direction.z) / 6.2831853 + 0.5,
		asin(clamp(direction.y, -1.0, 1.0)) / 3.1415927 + 0.5) * vec2(420.0, 210.0);
	float star_seed = hash21(floor(celestial_uv));
	float point = 1.0 - smoothstep(0.04, 0.20, length(fract(celestial_uv) - 0.5));
	float stars = step(0.994, star_seed) * point * night * smoothstep(0.04, 0.30, height);
	color += vec3(0.72, 0.83, 1.0) * stars * (1.0 - coverage) * 1.2;
	float sun_alignment = max(dot(direction, normalize(sun_direction)), 0.0);
	float sun_disk = smoothstep(0.99945, 0.99978, sun_alignment);
	float sun_glow = pow(sun_alignment, 160.0) * 0.18;
	color += sun_color * (sun_disk * 1.5 + sun_glow) * (1.0 - night) * (1.0 - coverage * 0.7);
	vec3 moon_direction = -normalize(sun_direction);
	float moon_alignment = dot(direction, moon_direction);
	float moon_disk = smoothstep(0.99925, 0.99965, moon_alignment);
	float moon_grain = 0.83 + noise21(direction.xz * 290.0) * 0.17;
	color += vec3(0.64, 0.75, 0.91) * moon_disk * moon_grain * night * (1.0 - coverage);
	COLOR = color;
}
