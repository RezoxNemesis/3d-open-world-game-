shader_type sky;
uniform vec3 zenith : source_color = vec3(0.19, 0.38, 0.57);
uniform vec3 horizon : source_color = vec3(0.74, 0.84, 0.86);
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p) {
	vec2 i=floor(p);vec2 f=fract(p);f=f*f*(3.0-2.0*f);
	return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);
}
void sky() {
	float height=max(EYEDIR.y,0.0);
	vec3 color=mix(horizon,zenith,pow(height,0.43));
	vec2 cloud_uv=EYEDIR.xz/max(0.13,height)*1.5;
	float cloud=noise(cloud_uv)*0.52+noise(cloud_uv*2.3)*0.27+noise(cloud_uv*5.1)*0.14+noise(cloud_uv*11.0)*0.07;
	float coverage=smoothstep(0.48,0.70,cloud)*smoothstep(0.015,0.18,height);
	vec3 shadow=vec3(0.60,0.71,0.78);
	vec3 lit=vec3(1.0,0.95,0.83);
	vec3 cloud_color=mix(shadow,lit,smoothstep(0.48,0.79,cloud));
	color=mix(color,cloud_color,coverage*0.91);
	float haze=pow(max(0.0,1.0-height*4.0),4.0);
	COLOR=mix(color,horizon,haze*0.34);
}
