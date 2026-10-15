shader_type spatial;
render_mode cull_disabled;
uniform vec4 water_color : source_color = vec4(0.035, 0.23, 0.22, 1.0);
uniform bool falling = false;
uniform float shore_scale = 1.0;
varying vec3 world_position;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
	vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
	return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void vertex() {
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	if (!falling) {
		VERTEX.y += sin(world_position.x * 1.4 + TIME * 0.8) * cos(world_position.z * 1.2 + TIME * 0.5) * 0.012;
	} else {
		float free_sheet = sin(UV.y * 3.14159);
		VERTEX.x += sin(UV.y * 15.0 - TIME * 3.1) * 0.045 * free_sheet;
		VERTEX.z += sin(UV.y * 19.0 - TIME * 4.3) * 0.035 * free_sheet;
	}
}
void fragment() {
	vec2 p = world_position.xz;
	vec2 flow = p * vec2(0.8, 1.3) + vec2(TIME * 0.11, -TIME * 0.17);
	float ripple = sin(p.x*2.8+p.y*2.3+TIME)*sin(p.x*2.6-p.y*3.7+TIME*0.7);
	float broad = noise(flow * 0.36);
	float detail = noise(flow * 4.0);
	float edge = min(min(UV.x, 1.0-UV.x), min(UV.y, 1.0-UV.y));
	float shallow = 1.0 - smoothstep(0.0, 0.12 * shore_scale, edge);
	vec3 color = mix(water_color.rgb,vec3(0.13,0.39,0.32),broad*0.66+ripple*0.025);
	color = mix(color, vec3(0.28,0.46,0.33), shallow * 0.50);
	float glint = pow(max(0.0,sin(p.x*4.4+p.y*3.6+TIME*0.8)),36.0);
	color += vec3(0.50,0.55,0.38)*glint*0.08;
	float wave_edge = smoothstep(0.76, 0.92, detail) * shallow;
	color = mix(color, vec3(0.67,0.78,0.64), wave_edge * 0.42);
	if (falling) {
		// Connected aerated water, with broken moving turbulence rather than
		// repeated vertical ribs or long discarded slots through the sheet.
		vec2 cascade = vec2(UV.x * 9.0 + sin(UV.y * 17.0 - TIME * 3.0) * 0.22, UV.y * 24.0 + TIME * 4.5);
		float thread = noise(cascade * vec2(1.5,0.65)) * 0.60 + noise(cascade * vec2(3.3,1.1)) * 0.40;
		float rim = abs(UV.x-0.5)*2.0;
		float ragged = 0.93 + noise(vec2(UV.y * 31.0 + TIME * 2.0, 5.0)) * 0.07;
		if (rim > ragged) { discard; }
		float foam = smoothstep(0.24,0.72,thread);
		color = mix(vec3(0.38,0.61,0.57),vec3(0.90,0.96,0.89),foam * 0.78 + 0.15);
		float base_froth = 1.0 - smoothstep(0.0,0.22,UV.y);
		color = mix(color,vec3(0.91,0.98,0.91),base_froth * 0.85);
		EMISSION = color * 0.10;
	}
	ALBEDO=color;
	ROUGHNESS=falling?0.35:0.29;
	METALLIC=0.03;
	SPECULAR=0.42;
	NORMAL_MAP=falling?vec3(0.5+(noise(vec2(UV.x*19.0,UV.y*24.0+TIME*4.5))-0.5)*0.08,0.5,1.0):vec3(0.5+ripple*0.018,0.5+sin(p.y*2.0+TIME)*0.012,1.0);
}
