extends Node3D
## Original distant ridge scenery stays in the small local frame of the expedition.
## Three opaque mesh bands replace distant world objects; they never affect traversal.

const DRAGON := preload("res://scripts/celestial_dragon.gd")
const SKY_SHADER := preload("res://assets/shaders/cloud_sky.gdshader")
const RIDGE_SEGMENTS := 384
const RIDGE_ROWS := 6

var _player: CharacterBody3D
var _world: Node3D
var _backdrop: Node3D
var _sun: DirectionalLight3D
var _dragon: Node3D
var _ridges: Array[MeshInstance3D] = []
var _preset := "balanced"
var _built := false


func setup(world: Node3D, player: CharacterBody3D) -> void:
	_player = player
	if is_instance_valid(_world) and _world.has_signal("rebased"):
		if _world.rebased.is_connected(_on_rebased):
			_world.rebased.disconnect(_on_rebased)
	_world = world
	if _world.has_signal("rebased"):
		_world.rebased.connect(_on_rebased)
	if not _built:
		_built = true
		name = "ExpeditionAtmosphere"
		_build_light()
		_backdrop = Node3D.new()
		_backdrop.name = "DistantHighlands"
		add_child(_backdrop)
		for layer in range(3):
			var ridge := MeshInstance3D.new()
			ridge.name = "RidgeLayer%d" % layer
			ridge.mesh = _ridge_mesh(layer)
			var material := StandardMaterial3D.new()
			material.vertex_color_use_as_albedo = true
			material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			material.cull_mode = BaseMaterial3D.CULL_DISABLED
			ridge.material_override = material
			ridge.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			_backdrop.add_child(ridge)
			_ridges.append(ridge)
		_dragon = DRAGON.new()
		_backdrop.add_child(_dragon)
		_dragon.build(world)
	_anchor_backdrop()
	apply_quality(_preset)


func apply_quality(preset: String) -> void:
	_preset = preset if preset in ["performance", "balanced", "high"] else "balanced"
	if not _built:
		return
	_sun.shadow_enabled = _preset != "performance"
	_sun.directional_shadow_max_distance = 80.0 if _preset == "high" else 50.0
	# Keep both distant layers on every preset so the horizon never disappears.
	_ridges[0].visible = _preset != "performance"
	_dragon.apply_quality(_preset)


func _process(_delta: float) -> void:
	_anchor_backdrop()


func _on_rebased(_offset: Vector3) -> void:
	_anchor_backdrop()


func _anchor_backdrop() -> void:
	if is_instance_valid(_player) and is_instance_valid(_backdrop):
		var point := _player.global_position
		_backdrop.global_position = Vector3(point.x, 0.0, point.z)


func _build_light() -> void:
	var environment := WorldEnvironment.new()
	environment.name = "HighlandSky"
	var settings := Environment.new()
	settings.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var clouds := ShaderMaterial.new()
	clouds.shader = SKY_SHADER
	clouds.set_shader_parameter("zenith", Color("477b9e"))
	clouds.set_shader_parameter("horizon", Color("cbd8d4"))
	sky.sky_material = clouds
	settings.sky = sky
	settings.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	settings.ambient_light_color = Color("a8c7cb")
	settings.ambient_light_energy = 0.40
	settings.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	settings.tonemap_exposure = 1.0
	settings.fog_enabled = true
	settings.fog_light_color = Color("c5d4d0")
	settings.fog_density = 0.0014
	settings.fog_sky_affect = 0.06
	environment.environment = settings
	add_child(environment)
	_sun = DirectionalLight3D.new()
	_sun.name = "HighlandMorningSun"
	_sun.rotation_degrees = Vector3(-32, -38, 0)
	_sun.light_color = Color("ffe7bf")
	_sun.light_energy = 1.08
	_sun.shadow_enabled = true
	_sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	_sun.shadow_bias = 0.06
	add_child(_sun)


func _ridge_mesh(layer: int) -> ArrayMesh:
	var noise := FastNoiseLite.new()
	noise.seed = 8417 + layer * 273
	noise.frequency = 0.004
	noise.fractal_octaves = 3
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	var colors := [Color("6b8784"), Color("8fa9ad"), Color("b2c3ca")]
	for row in range(RIDGE_ROWS - 1):
		for column in range(RIDGE_SEGMENTS):
			for corner in [
				Vector2i(0, 0),
				Vector2i(1, 0),
				Vector2i(1, 1),
				Vector2i(0, 0),
				Vector2i(1, 1),
				Vector2i(0, 1)
			]:
				var ring: int = row + corner.x
				var angle := float(column + corner.y) / RIDGE_SEGMENTS * TAU
				var point := _ridge_point(layer, ring, angle, noise)
				var adjacent := _ridge_point(layer, ring, angle + 0.005, noise)
				var across := _ridge_point(layer, mini(ring + 1, RIDGE_ROWS - 1), angle, noise)
				if ring == RIDGE_ROWS - 1:
					across = point + point - _ridge_point(layer, ring - 1, angle, noise)
				var normal := (adjacent - point).cross(across - point).normalized()
				if normal.y < 0:
					normal = -normal
				var shade := 0.94 + maxf(0.0, normal.dot(Vector3(-0.4, 0.7, -0.6))) * 0.06
				var color: Color = colors[layer] * shade
				color.a = 1.0
				surface.set_color(color)
				surface.set_normal(normal)
				surface.set_uv(Vector2(angle / TAU, float(ring) / (RIDGE_ROWS - 1)))
				surface.add_vertex(point)
	surface.index()
	return surface.commit()


func _ridge_point(layer: int, row: int, angle: float, noise: FastNoiseLite) -> Vector3:
	var radial := Vector2(sin(angle), cos(angle))
	var broad := noise.get_noise_2d(radial.x * 150.0, radial.y * 150.0)
	var fine := noise.get_noise_2d(radial.x * 660.0 + 181.0, radial.y * 660.0 - 73.0)
	# Unequal broad massifs frame open valleys. The north-facing arrival sees sky
	# between the flanks rather than a solid circular wall of repeated peaks.
	var offset := layer * 0.19
	var mass := _summit(angle, 2.36 + offset, 0.43) * 0.75
	mass += _summit(angle, 3.96 - offset, 0.36) * 1.0
	mass += _summit(angle, 0.63 + offset, 0.53) * 0.68
	mass += _summit(angle, 5.40 - offset, 0.42) * 0.82
	mass += _summit(angle, 1.29 - offset, 0.24) * 0.27
	var crest := 15.0 + layer * 18.0 + mass * (55.0 + layer * 27.0)
	crest += broad * 7.0 + fine * 2.0
	var profile := [-48.0, crest * 0.12, crest * 0.65, crest, crest * 0.56, -65.0]
	var radius := 250.0 + layer * 200.0 + row * 55.0 + broad * 18.0
	var height: float = profile[row]
	if row in [1, 2, 4]:
		height += fine * 3.0
	return Vector3(radial.x * radius, height, radial.y * radius)


func _summit(angle: float, center: float, width: float) -> float:
	var distance := angle_difference(angle, center) / width
	return exp(-distance * distance * 0.5)
