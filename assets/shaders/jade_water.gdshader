shader_type spatial;
render_mode cull_disabled;
uniform vec4 water_color : source_color = vec4(0.045, 0.27, 0.26, 1.0);
uniform bool falling = false;
varying vec3 world_position;
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
	vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
	return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void vertex() {
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	if (!falling) {
		VERTEX.y += sin(world_position.x * 1.4 + TIME * 0.8) * cos(world_position.z * 1.2 + TIME * 0.5) * 0.016;
	}
}
void fragment() {
	vec2 p = world_position.xz;
	float ripple = sin(p.x*2.8+p.y*2.3+TIME)*sin(p.x*2.6-p.y*3.7+TIME*0.7);
	float broad = noise(p*0.22+TIME*0.018);
	vec3 color = mix(water_color.rgb,vec3(0.17,0.48,0.39),broad*0.65+ripple*0.035);
	float glint = pow(max(0.0,sin(p.x*4.4+p.y*3.6+TIME*0.5)),36.0);
	color += vec3(0.50,0.55,0.38)*glint*0.085;
	if (falling) {
		vec2 flow = vec2(UV.x*19.0,UV.y*26.0+TIME*5.5);
		float thread = noise(flow*vec2(2.8,0.18))*0.55+noise(flow*vec2(5.7,0.50))*0.45;
		float rim = abs(UV.x-0.5)*2.0;
		float ragged = 0.88+noise(vec2(UV.y*24.0+TIME*0.4,5.0))*0.12;
		if (rim>ragged || (thread<0.19 && UV.y<0.87)) { discard; }
		float foam = smoothstep(0.30,0.75,thread);
		color=mix(vec3(0.28,0.49,0.48),vec3(0.91,0.97,0.92),foam*0.68+0.24);
		float base_froth=1.0-smoothstep(0.0,0.20,UV.y);
		color=mix(color,vec3(0.88,0.96,0.91),base_froth*0.60);
	}
	ALBEDO=color;
	ROUGHNESS=falling?0.39:0.17;
	METALLIC=0.08;
	SPECULAR=0.72;
	NORMAL_MAP=falling?vec3(0.5,0.5,1.0):vec3(0.5+ripple*0.06,0.5+sin(p.y*4.0+TIME)*0.04,1.0);
}
