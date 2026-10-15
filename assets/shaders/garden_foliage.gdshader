shader_type spatial;
render_mode cull_disabled;
uniform float wind_strength = 0.045;
uniform bool blossom = false;
uniform bool use_atlas = false;
uniform sampler2D foliage_atlas : source_color, filter_linear_mipmap_anisotropic, repeat_disable;
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
	float branch_light = 0.91 + 0.09 * sin(leaf_position.x * 3.4 + leaf_position.z * 2.7);
	ALBEDO = color * branch_light;
	// Alpha follows the original painted leaf/petal silhouette, never random crown holes.
	ALPHA = painted.a;
	ALPHA_SCISSOR_THRESHOLD = 0.38;
	if (!FRONT_FACING) { NORMAL = -NORMAL; }
	ROUGHNESS = blossom ? 0.92 : 0.82;
	SPECULAR = 0.16;
	BACKLIGHT = color * 0.13;
}
