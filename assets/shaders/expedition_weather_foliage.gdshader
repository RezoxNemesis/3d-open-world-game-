shader_type spatial;
render_mode cull_disabled;
uniform float wind_strength = 0.045;
uniform bool blossom = false;
uniform bool use_atlas = false;
uniform sampler2D foliage_atlas : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
uniform vec3 season_tint : source_color = vec3(1.0);
uniform float snow_cover : hint_range(0.0, 1.0) = 0.0;
uniform float wetness : hint_range(0.0, 1.0) = 0.0;
varying vec3 leaf_position;
varying vec4 leaf_color;
void vertex() {
	leaf_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	leaf_color = COLOR;
	float wind = sin(leaf_position.x * 0.33 + TIME * 1.1) * cos(leaf_position.z * 0.21 + TIME * 0.7);
	VERTEX.x += wind * max(VERTEX.y + (use_atlas ? 0.5 : 0.0), 0.0) * wind_strength;
}
void fragment() {
	vec4 painted = use_atlas ? texture(foliage_atlas, UV) : vec4(1.0);
	vec3 color = leaf_color.rgb * painted.rgb;
	float leaf_mask = blossom ? 0.20 : 1.0;
	color *= mix(vec3(1.0), season_tint, leaf_mask);
	float autumn = clamp((1.0-season_tint.b)*1.9,0.0,1.0)*leaf_mask;
	color=mix(color,vec3(0.60,0.27,0.055)*(0.7+painted.g*0.3),autumn*0.7);
	float snow=snow_cover*(0.65+0.35*sin(leaf_position.x*2.4+leaf_position.z*1.9));
	color=mix(color,vec3(0.73,0.81,0.85),snow);
	float branch_light = 0.91 + 0.09 * sin(leaf_position.x * 3.4 + leaf_position.z * 2.7);
	ALBEDO = color * branch_light * (1.0-wetness*0.12);
	ALPHA = painted.a;
	ALPHA_SCISSOR_THRESHOLD = 0.38;
	if (!FRONT_FACING) { NORMAL = -NORMAL; }
	ROUGHNESS = mix(blossom ? 0.92 : 0.82,0.70,wetness);
	SPECULAR = 0.16;
	BACKLIGHT = color * 0.13;
}
