shader_type spatial;
render_mode unshaded, cull_disabled, depth_draw_never, shadows_disabled;
uniform float opacity = 0.19;
void vertex() {
	// A small number of shared billboards surrounds actual waterfall impacts.
	MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
	VERTEX.x += sin(TIME*0.42 + MODEL_MATRIX[3].x) * 0.10;
	VERTEX.y += sin(TIME*0.31 + MODEL_MATRIX[3].z) * 0.08;
}
void fragment() {
	vec2 p=UV*2.0-1.0;
	float cloud=exp(-dot(p*vec2(1.0,1.15),p*vec2(1.0,1.15))*3.8);
	float wisps=0.75+sin(UV.x*17.0+UV.y*11.0+TIME*0.3)*0.10;
	ALBEDO=vec3(0.78,0.89,0.86);
	ALPHA=cloud*wisps*opacity;
}
