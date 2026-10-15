shader_type spatial;
uniform vec3 biome_tint : source_color = vec3(0.7, 0.9, 0.7);
uniform vec3 season_tint : source_color = vec3(1.0);
uniform float snow_cover : hint_range(0.0, 1.0) = 0.0;
uniform float wetness : hint_range(0.0, 1.0) = 0.0;
varying vec3 ground_point;
varying vec3 slope_normal;
float hash21(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.5453); }
float noise21(vec2 p) {
	vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
	return mix(mix(hash21(i),hash21(i+vec2(1,0)),f.x),
	mix(hash21(i+vec2(0,1)),hash21(i+vec2(1,1)),f.x),f.y);
}
void vertex() { ground_point=VERTEX; slope_normal=NORMAL; }
void fragment() {
	vec2 p=ground_point.xz;
	float broad=noise21(p*0.13); float detail=noise21(p*1.8); float grain=noise21(p*19.0);
	vec3 meadow=mix(vec3(0.12,0.23,0.10),vec3(0.33,0.41,0.18),broad);
	meadow*=biome_tint*season_tint*(0.86+detail*0.22+grain*0.1);
	float soil=smoothstep(0.68,0.88,noise21(p*0.37+18.0));
	meadow=mix(meadow,vec3(0.31,0.27,0.17)*season_tint,soil*0.65);
	float slope=smoothstep(0.14,0.4,1.0-slope_normal.y);
	vec3 rock=mix(vec3(0.28,0.31,0.22),vec3(0.43,0.44,0.32),detail);
	vec3 earth=mix(meadow,rock,slope*0.75)*(1.0-wetness*0.16);
	float snow=snow_cover*smoothstep(0.35,0.85,slope_normal.y)*smoothstep(0.06,0.58,broad);
	ALBEDO=mix(earth,vec3(0.70,0.78,0.82)*(0.9+detail*0.1),snow);
	ROUGHNESS=mix(0.96,0.72,wetness);
}
