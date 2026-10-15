extends Node3D
## Original distant ridge scenery stays in the small local frame of the expedition.
## Three opaque mesh bands replace distant world objects; they never affect traversal.

const DRAGON := preload("res://scripts/celestial_dragon.gd")
const SKY_SHADER := preload("res://assets/shaders/expedition_sky.gdshader")
const WEATHER := preload("res://scripts/expedition_weather.gd")
const WEATHER_GROUND := preload("res://assets/shaders/expedition_weather_ground.gdshader")
const WEATHER_FOLIAGE := preload("res://assets/shaders/expedition_weather_foliage.gdshader")
const RIDGE_SEGMENTS := 384
const RIDGE_ROWS := 6

var weather: Node3D
var _player: CharacterBody3D
var _world: Node3D
var _backdrop: Node3D
var _sun: DirectionalLight3D
var _moon: DirectionalLight3D
var _environment: Environment
var _sky_material: ShaderMaterial
var _dragon: Node3D
var _ridges: Array[MeshInstance3D] = []
var _preset := "balanced"
var _built := false
var _weather_initialized := false
var _sun_direction := Vector3(0.6, 0.7, -0.32).normalized()
var _material_clock := 0.0
var _season_bindings: Array[WeakRef] = []
var _season_tint := Color.WHITE
var _snow_cover := 0.0
var _wetness := 0.0


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
			material.vertex_color_is_srgb = true
			# Vertex colors already contain authored slope lighting. Relighting
			# these distant bands produced pale faces and specular crest dots.
			material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			material.specular_mode = BaseMaterial3D.SPECULAR_DISABLED
			material.roughness = 1.0
			material.cull_mode = BaseMaterial3D.CULL_DISABLED
			ridge.material_override = material
			ridge.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			_backdrop.add_child(ridge)
			_ridges.append(ridge)
		_dragon = DRAGON.new()
		_backdrop.add_child(_dragon)
		_dragon.build(world)
		weather = WEATHER.new()
		add_child(weather)
		weather.setup(world, player, self)
	_anchor_backdrop()
	apply_quality(_preset)


func apply_quality(preset: String) -> void:
	_preset = preset if preset in ["performance", "balanced", "high"] else "balanced"
	if not _built:
		return
	_sun.shadow_enabled = _preset != "performance"
	_sun.directional_shadow_max_distance = 80.0 if _preset == "high" else 40.0
	# Keep both distant layers on every preset so the horizon never disappears.
	_ridges[0].visible = _preset != "performance"
	_dragon.apply_quality(_preset)
	weather.apply_quality(_preset)


func _process(delta: float) -> void:
	_anchor_backdrop()
	_material_clock += delta
	if _material_clock >= 0.5:
		_material_clock = 0.0
		_bind_season_materials()
		_apply_season_materials()


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
	_environment = settings
	settings.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var clouds := ShaderMaterial.new()
	_sky_material = clouds
	clouds.shader = SKY_SHADER
	clouds.set_shader_parameter("zenith", Color("3f769b"))
	clouds.set_shader_parameter("horizon", Color("bfd3d2"))
	clouds.set_shader_parameter("sun_color", Color("ffe3b5"))
	clouds.set_shader_parameter("cloud_cover", 0.22)
	clouds.set_shader_parameter("night", 0.0)
	sky.sky_material = clouds
	settings.sky = sky
	settings.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	settings.ambient_light_color = Color("a8c7cb")
	settings.ambient_light_energy = 0.34
	settings.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	settings.tonemap_exposure = 1.0
	settings.fog_enabled = true
	settings.fog_light_color = Color("acc9c8")
	settings.fog_density = 0.0023
	settings.fog_sky_affect = 0.10
	environment.environment = settings
	add_child(environment)
	_sun = DirectionalLight3D.new()
	_sun.name = "HighlandMorningSun"
	_sun.rotation_degrees = Vector3(-29, -57, 0)
	_sun.light_color = Color("ffe3b5")
	_sun.light_energy = 0.96
	_sun.shadow_enabled = true
	_sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	_sun.shadow_bias = 0.06
	add_child(_sun)
	_moon = DirectionalLight3D.new()
	_moon.name = "HighlandMoon"
	_moon.light_color = Color("a6c5ef")
	_moon.light_energy = 0.0
	_moon.shadow_enabled = false
	add_child(_moon)


func apply_weather_profile(profile: Dictionary, transition: float) -> void:
	var blend := clampf(transition, 0.0, 1.0) if _weather_initialized else 1.0
	_weather_initialized = true
	for parameter in ["zenith", "horizon", "sun_color"]:
		var current: Color = _sky_material.get_shader_parameter(parameter)
		_sky_material.set_shader_parameter(parameter, current.lerp(profile[parameter], blend))
	for parameter in ["cloud_cover", "night"]:
		var current: float = _sky_material.get_shader_parameter(parameter)
		_sky_material.set_shader_parameter(parameter, lerpf(current, profile[parameter], blend))
	_sun_direction = _sun_direction.slerp(profile.sun_direction, blend).normalized()
	_sky_material.set_shader_parameter("sun_direction", _sun_direction)
	_sun.look_at(-_sun_direction, Vector3.UP)
	_moon.look_at(_sun_direction, Vector3.UP)
	_sun.light_color = _sun.light_color.lerp(profile.sun_color, blend)
	_sun.light_energy = lerpf(_sun.light_energy, profile.sun_energy, blend)
	_moon.light_energy = lerpf(_moon.light_energy, profile.moon_energy, blend)
	_sun.shadow_enabled = _preset != "performance" and _sun.light_energy > 0.08
	_environment.ambient_light_color = _environment.ambient_light_color.lerp(
		profile.ambient_color, blend
	)
	_environment.ambient_light_energy = lerpf(
		_environment.ambient_light_energy, profile.ambient_energy, blend
	)
	_environment.fog_light_color = _environment.fog_light_color.lerp(profile.fog_color, blend)
	_environment.fog_density = lerpf(_environment.fog_density, profile.fog_density, blend)
	_environment.fog_sky_affect = 0.04
	_season_tint = _season_tint.lerp(profile.season_tint, blend)
	_snow_cover = lerpf(_snow_cover, profile.snow_cover, blend)
	_wetness = lerpf(_wetness, profile.wetness, blend)
	var ridge_tint := Color.WHITE.lerp(Color(0.16, 0.21, 0.32), profile.night)
	for ridge in _ridges:
		var material := ridge.material_override as StandardMaterial3D
		material.albedo_color = material.albedo_color.lerp(ridge_tint, blend)


func _bind_season_materials() -> void:
	if not is_instance_valid(_world):
		return
	for item: GeometryInstance3D in _world.find_children("*", "GeometryInstance3D", true, false):
		if _underwater_scenery(item):
			continue
		if item.get_meta("expedition_weather_owner", 0) == get_instance_id():
			continue
		var mesh: Mesh
		if item is MeshInstance3D:
			mesh = item.mesh
		elif item is MultiMeshInstance3D and item.multimesh != null:
			mesh = item.multimesh.mesh
		if mesh == null or mesh.get_surface_count() != 1:
			continue
		var original := item.material_override as ShaderMaterial
		if original == null:
			original = mesh.surface_get_material(0) as ShaderMaterial
		if original == null or original.shader == null:
			continue
		var shader: Shader
		if original.shader.resource_path == "res://assets/shaders/garden_foliage.gdshader":
			shader = WEATHER_FOLIAGE
		elif original.shader.code.contains("uniform vec3 biome_tint"):
			shader = WEATHER_GROUND
		if shader == null:
			continue
		# The material belongs only to this streamed instance. Never tint the
		# world's static terrain palette or the original journey's shared art.
		var seasonal := ShaderMaterial.new()
		seasonal.shader = shader
		for parameter in ["biome_tint", "blossom", "wind_strength", "use_atlas", "foliage_atlas"]:
			var value: Variant = original.get_shader_parameter(parameter)
			if value != null:
				seasonal.set_shader_parameter(parameter, value)
		item.material_override = seasonal
		item.set_meta("expedition_weather_owner", get_instance_id())
		_season_bindings.append(weakref(seasonal))


func _underwater_scenery(item: Node) -> bool:
	var ancestor := item.get_parent()
	while ancestor != null and ancestor != _world:
		if ancestor.name == "AzureSea":
			return true
		ancestor = ancestor.get_parent()
	return false


func _apply_season_materials() -> void:
	for index in range(_season_bindings.size() - 1, -1, -1):
		var material := _season_bindings[index].get_ref() as ShaderMaterial
		if material == null:
			_season_bindings.remove_at(index)
			continue
		material.set_shader_parameter("season_tint", _season_tint)
		material.set_shader_parameter("snow_cover", _snow_cover)
		material.set_shader_parameter("wetness", _wetness)


func _ridge_mesh(layer: int) -> ArrayMesh:
	var noise := FastNoiseLite.new()
	noise.seed = 8417 + layer * 273
	noise.frequency = 0.004
	noise.fractal_octaves = 3
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	var colors := [Color("718f89"), Color("92b4b8"), Color("c1dadc")]
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
				var shade := 0.72 + maxf(0.0, normal.dot(Vector3(-0.4, 0.7, -0.6))) * 0.28
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
	var mass := _summit(angle, 2.36 + offset, 0.23) * 0.75
	mass += _summit(angle, 3.96 - offset, 0.18) * 1.0
	mass += _summit(angle, 0.63 + offset, 0.29) * 0.68
	mass += _summit(angle, 5.40 - offset, 0.21) * 0.82
	mass += _summit(angle, 1.29 - offset, 0.14) * 0.27
	# Break long Gaussian shoulders into unequal craggy summits while keeping
	# the same named massifs and modest six-row/384-column mesh budget.
	mass *= 0.93 + sin(angle * 17.0 + layer * 1.7) * 0.13 + cos(angle * 31.0 - layer) * 0.065
	var crest := -12.0 + layer * 8.0 + mass * (125.0 + layer * 48.0)
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
