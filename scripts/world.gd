extends Node3D
## Authored temple district inside deterministic, bounded streamed terrain.

const SEED := 73109
const WATER_SHADER := preload("res://assets/shaders/jade_water.gdshader")
var rng := RandomNumberGenerator.new()
var stone: ShaderMaterial
var pale_stone: StandardMaterial3D
var red_wood: StandardMaterial3D
var dark_stone: StandardMaterial3D
var moss: StandardMaterial3D
var gold: StandardMaterial3D
var terrain_noise := FastNoiseLite.new()
var terrain_surface: ShaderMaterial
var quality_preset := "balanced"
var nature: Node3D
var modules: Dictionary = {}
var lantern_transforms: Array[Transform3D] = []


func material(color: Color, roughness: float = 0.9) -> StandardMaterial3D:
	var result := StandardMaterial3D.new()
	result.albedo_color = color
	result.roughness = roughness
	return result


func _ready() -> void:
	rng.seed = SEED
	terrain_noise.seed = SEED
	terrain_noise.frequency = 0.022
	stone = ShaderMaterial.new()
	stone.shader = preload("res://assets/shaders/garden_stone.gdshader")
	pale_stone = material(Color("acac92"))
	red_wood = material(Color("7b3026"))
	dark_stone = material(Color("596253"))
	moss = material(Color("566848"))
	terrain_surface = ShaderMaterial.new()
	terrain_surface.shader = preload("res://assets/shaders/terrain_ground.gdshader")
	gold = material(Color("c6a765"), 0.38)
	for label in ["pavilion", "pavilion_far", "gate", "lantern", "bridge", "shrine"]:
		var path := "res://assets/models/%s.glb" % label
		if ResourceLoader.exists(path):
			modules[label] = load(path)
		else:
			push_error("Missing architectural module: " + path)
	setup_sky()
	build_courtyard()
	build_temple()
	build_lotus_garden()
	build_eastern_gate()
	build_landscape()
	batch_lanterns()
	var ambience := preload("res://scripts/ambience.gd").new()
	ambience.name = "GardenAmbience"
	add_child(ambience)
	apply_quality(quality_preset)


func solid(
	mesh: Mesh, location: Vector3, surface: Material, collision: bool = true
) -> MeshInstance3D:
	var item := MeshInstance3D.new()
	item.mesh = mesh
	item.material_override = surface
	item.position = location
	item.visibility_range_end = 230
	add_child(item)
	if collision:
		var body := StaticBody3D.new()
		var shape := CollisionShape3D.new()
		if mesh is BoxMesh:
			var box := BoxShape3D.new()
			box.size = mesh.size
			shape.shape = box
		else:
			shape.shape = mesh.create_trimesh_shape()
		body.add_child(shape)
		item.add_child(body)
	return item


func block(
	size_value: Vector3, location: Vector3, surface: Material, collision: bool = true
) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size_value
	return solid(mesh, location, surface, collision)


func module_at(
	label: String, location: Vector3, size_value: float = 1.0, yaw: float = 0.0
) -> Node3D:
	if label == "lantern":
		lantern_transforms.append(
			Transform3D(Basis(Vector3.UP, yaw).scaled(Vector3.ONE * size_value), location)
		)
		return null
	var item: Node3D
	if modules.has(label):
		item = modules[label].instantiate()
	else:
		item = Node3D.new()
	item.name = label.capitalize()
	item.position = location
	if label in ["pavilion", "pavilion_far"]:
		# Align the imported upper plinth with the authored walkable floor.
		item.position.y -= 0.59 * size_value
	item.scale = Vector3.ONE * size_value
	item.rotation.y = yaw
	add_child(item)
	if label in ["lantern", "pavilion_far"]:
		for child in item.find_children("*", "MeshInstance3D", true, false):
			child.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return item


func batch_lanterns() -> void:
	if not modules.has("lantern"):
		return
	var prototype: Node3D = modules["lantern"].instantiate()
	for source in prototype.find_children("*", "MeshInstance3D", true, false):
		var local: Transform3D = source.transform
		var ancestor := source.get_parent()
		while ancestor is Node3D:
			local = ancestor.transform * local
			ancestor = ancestor.get_parent()
		var multi := MultiMesh.new()
		multi.transform_format = MultiMesh.TRANSFORM_3D
		multi.mesh = source.mesh
		multi.instance_count = lantern_transforms.size()
		for i in range(lantern_transforms.size()):
			multi.set_instance_transform(i, lantern_transforms[i] * local)
		var item := MultiMeshInstance3D.new()
		item.name = "LanternBatch"
		item.multimesh = multi
		item.material_override = source.material_override
		item.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		item.visibility_range_end = 140
		add_child(item)
	prototype.free()


func setup_sky() -> void:
	var environment := WorldEnvironment.new()
	environment.name = "Atmosphere"
	var settings := Environment.new()
	settings.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sky_material := ShaderMaterial.new()
	sky_material.shader = preload("res://assets/shaders/cloud_sky.gdshader")
	sky.sky_material = sky_material
	settings.sky = sky
	settings.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	settings.ambient_light_color = Color("b5cbd2")
	settings.ambient_light_energy = 0.42
	settings.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	settings.tonemap_exposure = 1.0
	settings.fog_enabled = true
	settings.fog_light_color = Color("bdd1c9")
	settings.fog_density = 0.0014
	settings.fog_sky_affect = 0.05
	environment.environment = settings
	add_child(environment)
	var sun := DirectionalLight3D.new()
	sun.name = "AfternoonSun"
	sun.rotation_degrees = Vector3(-39, -48, 0)
	sun.light_color = Color("ffe5ba")
	sun.light_energy = 0.85
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 65
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_2_SPLITS
	sun.shadow_bias = 0.06
	add_child(sun)


func build_courtyard() -> void:
	block(Vector3(42, 0.9, 42), Vector3(0, -0.45, 0), stone)
	# The retained south wall protects the starter route; side exits lead to gardens.
	block(Vector3(42, 1.2, 0.65), Vector3(0, 0.6, 20), pale_stone)
	for x in [-20.5, 20.5]:
		for z in [-13.5, 11.5]:
			block(Vector3(0.5, 0.65, 12), Vector3(x, 0.325, z), pale_stone)
	# Broad stone routes give continuous collision through both open side gates.
	block(Vector3(27, 0.7, 7), Vector3(29, -0.35, -4), stone)
	block(Vector3(22, 0.7, 7), Vector3(-28, -0.35, 1), stone)
	for x in [-13, 13]:
		block(Vector3(7.4, 0.2, 8.5), Vector3(x, 0.1, 7), dark_stone)
		block(Vector3(6.7, 0.24, 7.8), Vector3(x, 0.2, 7), moss, false)
	for x in [-8.0, 8.0]:
		for z in [14, 5, -5]:
			module_at("lantern", Vector3(x, 0, z), 0.8)
			if z == 5:
				var light := OmniLight3D.new()
				light.position = Vector3(x, 1.5, z)
				light.light_color = Color("ffd299")
				light.light_energy = 0.6
				light.omni_range = 3.2
				add_child(light)
	for x in [-16, 16]:
		module_at("pavilion", Vector3(x, 0.1, -10), 0.68)
		block(Vector3(8.3, 0.6, 6.3), Vector3(x, -0.2, -10), stone)
		for px in [x - 3.06, x + 3.06]:
			for z in [-7.926, -10, -12.074]:
				var pillar := block(Vector3(0.30, 2.2, 0.30), Vector3(px, 1.2, z), red_wood)
				pillar.visible = false
	# Small reflecting pool off the main walking axis.
	block(Vector3(5.5, 0.32, 8.2), Vector3(8, 0.16, -0.8), dark_stone)
	water_surface(Vector3(8, 0.37, -0.8), Vector2(4.7, 7.4))
	for x in [5.3, 10.7]:
		block(Vector3(0.38, 0.5, 8.4), Vector3(x, 0.25, -0.8), pale_stone)
	for z in [-4.8, 3.2]:
		block(Vector3(5.8, 0.5, 0.38), Vector3(8, 0.25, z), pale_stone)
	build_lotus(Vector3(8, 0.41, -1), 8)
	# Tiny golden garden accents share physical paving, without fake gameplay prompts.
	for x in [-6, 6]:
		block(Vector3(0.42, 0.09, 24), Vector3(x, 0.05, 5), gold, false)


func build_temple() -> void:
	for i in range(8):
		var height := (i + 1) * 0.22
		block(Vector3(10, height, 0.95), Vector3(0, height / 2, -8 - i * 0.85), stone)
	block(Vector3(15, 1.76, 9.5), Vector3(0, 0.88, -18.25), stone)
	module_at("pavilion", Vector3(0, 1.76, -18))
	# Pillar colliders are intentionally separate from high-detail decorative GLBs.
	for x in [-4.5, 4.5]:
		for z in [-14.95, -18, -21.05]:
			var pillar := block(Vector3(0.36, 3.23, 0.36), Vector3(x, 3.375, z), red_wood)
			pillar.visible = false
	for x in [-5.8, 5.8]:
		for z in [-10, -13]:
			module_at("lantern", Vector3(x, 0 if z == -10 else 1.76, z), 0.9)
	module_at("shrine", Vector3(0, 1.76, -18.8), 0.62)
	for x in [-4.6, 4.6]:
		banner_at(Vector3(x, 3.65, -14.6), Vector2(1.15, 3.2))
	# Distant smaller pavilions repeat the architecture in the hillside composition.
	for placement in [
		Vector3(-32, 6, -36),
		Vector3(30, 10, -44),
		Vector3(-62, 23, -61),
		Vector3(67, 33, -83),
		Vector3(3, 42, -125),
		Vector3(-104, 46, -123)
	]:
		build_cliff(placement - Vector3(0, 2, 0), Vector2(10, 8), placement.y + 3)
		block(Vector3(13, 0.6, 10), placement - Vector3(0, 0.3, 0), dark_stone, false)
		module_at("pavilion_far", placement, 0.8)


func water_surface(location: Vector3, size_value: Vector2, falling: bool = false) -> MeshInstance3D:
	var shader := ShaderMaterial.new()
	shader.shader = WATER_SHADER
	shader.set_shader_parameter("falling", falling)
	var plane := PlaneMesh.new()
	plane.size = size_value
	plane.subdivide_width = 6
	plane.subdivide_depth = 6
	var item := solid(plane, location, shader, false)
	if falling:
		item.rotation.x = PI / 2
	return item


func build_lotus_garden() -> void:
	# Recessed pool with an accessible waterfront deck at the lotus landmark.
	block(Vector3(26, 0.6, 34), Vector3(-34, -1.1, 0), dark_stone)
	water_surface(Vector3(-34, -0.40, 0), Vector2(24, 32))
	block(Vector3(6.5, 0.7, 11.8), Vector3(-30, -0.35, 1), stone)
	module_at("bridge", Vector3(-30, 0, 1))
	for z in [-15, 15]:
		block(Vector3(27, 0.6, 2.5), Vector3(-34, -0.3, z), stone)
		for x in [-43, -36, -24]:
			module_at("lantern", Vector3(x, 0, z), 0.75)
	module_at("pavilion", Vector3(-34, 0, -17), 0.65)
	block(Vector3(10, 0.8, 7), Vector3(-34, -0.4, -17), stone)
	build_lotus(Vector3(-34, -0.35, 0), 36)
	build_waterfall(Vector3(-45, 0, -22.5), 18, 4.2)
	build_cliff(Vector3(-47, 20, -32), Vector2(10, 7), 20)
	module_at("shrine", Vector3(-47, 20, -32), 0.85)


func build_eastern_gate() -> void:
	module_at("gate", Vector3(30, 0, -4), 1.0, PI / 2)
	for z in [-7.4, -0.6]:
		var pillar := block(Vector3(0.58, 4.05, 0.58), Vector3(30, 2.025, z), red_wood)
		pillar.visible = false
		module_at("lantern", Vector3(27, 0, z), 0.8)
		banner_at(Vector3(29.4, 2.5, z), Vector2(0.85, 2.8), -PI / 2)
	block(Vector3(11, 0.7, 16), Vector3(41, -0.35, -4), stone)
	module_at("pavilion", Vector3(42, 0, -11), 0.55)
	for z in [-11.5, 3.5]:
		block(Vector3(18, 0.9, 0.35), Vector3(31, 0.45, z), red_wood)


func banner_at(location: Vector3, size_value: Vector2, yaw: float = 0) -> void:
	var shader := ShaderMaterial.new()
	shader.shader = preload("res://assets/shaders/silk_banner.gdshader")
	shader.set_shader_parameter("silk", preload("res://assets/materials/lotus_banner.svg"))
	var mesh := PlaneMesh.new()
	mesh.size = size_value
	mesh.subdivide_width = 3
	mesh.subdivide_depth = 14
	var item := solid(mesh, location, shader, false)
	item.rotation = Vector3(PI / 2, yaw, 0)
	var bar := block(
		Vector3(size_value.x + 0.15, 0.08, 0.08),
		location + Vector3(0, size_value.y / 2, 0),
		gold,
		false
	)
	bar.rotation.y = yaw


func build_lotus(origin: Vector3, count: int) -> void:
	var petal := SphereMesh.new()
	petal.radius = 0.18
	petal.height = 0.08
	petal.radial_segments = 7
	petal.rings = 3
	var petals := MultiMesh.new()
	petals.transform_format = MultiMesh.TRANSFORM_3D
	petals.use_colors = true
	petals.mesh = petal
	petals.instance_count = count * 7
	var leaf_mesh := CylinderMesh.new()
	leaf_mesh.top_radius = 0.52
	leaf_mesh.bottom_radius = 0.52
	leaf_mesh.height = 0.02
	leaf_mesh.radial_segments = 12
	var leaves := MultiMesh.new()
	leaves.transform_format = MultiMesh.TRANSFORM_3D
	leaves.mesh = leaf_mesh
	leaves.instance_count = count
	for i in range(count):
		var point := (
			origin
			+ Vector3(
				rng.randf_range(-2, 2) if count < 10 else rng.randf_range(-10, 10),
				0,
				rng.randf_range(-3, 3) if count < 10 else rng.randf_range(-13, 13)
			)
		)
		leaves.set_instance_transform(i, Transform3D(Basis.IDENTITY, point))
		for j in range(7):
			var angle := j * TAU / 7
			var basis := Basis.from_euler(Vector3(0, -angle, 0.8)).scaled(Vector3(1.0, 1.0, 1.9))
			petals.set_instance_transform(
				i * 7 + j,
				Transform3D(basis, point + Vector3(cos(angle) * 0.15, 0.18, sin(angle) * 0.15))
			)
			petals.set_instance_color(
				i * 7 + j, Color("f3bbc1").lerp(Color("fff0d4"), float(j) / 9)
			)
	var blooms := MultiMeshInstance3D.new()
	blooms.multimesh = petals
	var flower_material := material(Color.WHITE)
	flower_material.vertex_color_use_as_albedo = true
	blooms.material_override = flower_material
	add_child(blooms)
	var pads := MultiMeshInstance3D.new()
	pads.multimesh = leaves
	pads.material_override = material(Color("456a42"))
	add_child(pads)


func build_waterfall(origin: Vector3, height: float, width: float) -> void:
	var shader := ShaderMaterial.new()
	shader.shader = WATER_SHADER
	shader.set_shader_parameter("falling", true)
	var stream := SurfaceTool.new()
	stream.begin(Mesh.PRIMITIVE_TRIANGLES)
	for row in range(12):
		for column in range(4):
			for offset in [
				Vector2i(0, 0),
				Vector2i(0, 1),
				Vector2i(1, 0),
				Vector2i(1, 0),
				Vector2i(0, 1),
				Vector2i(1, 1)
			]:
				var uv := Vector2(float(column + offset.x) / 4.0, float(row + offset.y) / 12.0)
				stream.set_uv(uv)
				stream.set_normal(Vector3.FORWARD)
				stream.add_vertex(
					Vector3(
						(uv.x - 0.5) * width * (0.92 + sin(uv.y * 11.0) * 0.07),
						uv.y * height,
						-uv.y * 2.8 + sin(uv.y * 6.0) * 0.25
					)
				)
	var falling := solid(stream.commit(), origin, shader, false)
	falling.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var basin_shader := ShaderMaterial.new()
	basin_shader.shader = WATER_SHADER
	var basin := CylinderMesh.new()
	basin.top_radius = width * 0.90
	basin.bottom_radius = width * 0.90
	basin.height = 0.04
	basin.radial_segments = 24
	var pool := solid(basin, origin + Vector3(0, -0.12, 1.0), basin_shader, false)
	pool.scale.z = 0.72
	pool.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var boulder_mesh := SphereMesh.new()
	boulder_mesh.radius = 1.0
	boulder_mesh.height = 1.6
	boulder_mesh.radial_segments = 9
	boulder_mesh.rings = 4
	var boulders := MultiMesh.new()
	boulders.transform_format = MultiMesh.TRANSFORM_3D
	boulders.use_colors = true
	boulders.mesh = boulder_mesh
	boulders.instance_count = 10
	for index in range(10):
		var angle := index * TAU / 10
		var size_value := rng.randf_range(0.55, 1.05)
		boulders.set_instance_transform(
			index,
			Transform3D(
				Basis(Vector3.UP, angle).scaled(Vector3(size_value, size_value * 0.72, size_value)),
				origin + Vector3(cos(angle) * width * 0.82, -0.10, sin(angle) * width * 0.57 + 1.0)
			)
		)
		boulders.set_instance_color(index, Color("4e6659").lerp(Color("87907a"), rng.randf()))
	var bank := MultiMeshInstance3D.new()
	bank.multimesh = boulders
	var wet_rock := material(Color.WHITE)
	wet_rock.vertex_color_use_as_albedo = true
	wet_rock.vertex_color_is_srgb = true
	wet_rock.roughness = 0.62
	bank.material_override = wet_rock
	bank.visibility_range_end = 160
	add_child(bank)
	var foam := material(Color("d0e1d0"))
	for i in range(3):
		var mist := SphereMesh.new()
		mist.radius = rng.randf_range(0.4, 0.8)
		mist.height = 0.05
		mist.radial_segments = 10
		mist.rings = 3
		var splash := solid(
			mist, origin + Vector3(rng.randf_range(-width / 3, width / 3), -0.03, 0.3), foam, false
		)
		splash.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func cliff_vertex(
	level: int, sector: int, width: Vector2, height: float, spire: bool, phase: float = 0.0
) -> Vector3:
	var t := float(level) / 14.0
	var angle := sector * TAU / 20.0
	var shoulder := (
		1.0
		+ 0.027 * sin(t * 17.0 + phase)
		+ 0.020 * sin(t * 37.0 + phase * 2.4)
		+ 0.010 * sin(t * 67.0 - phase)
	)
	var taper := 1.0 + pow(1.0 - t, 2.0) * 0.36
	if spire:
		# Karst pillars retain steep upper shoulders and an uneven crown, rather than a cone.
		taper = lerpf(1.55, 0.67, smoothstep(0.0, 0.88, t))
		if t > 0.90:
			taper *= lerpf(1.0, 0.62, (t - 0.90) / 0.10)
	var fluting := (
		0.95
		+ sin(angle * 5.0 + phase) * 0.07
		+ sin(angle * 9.0 + phase * 2.0) * 0.055
		+ sin(angle * 13.0 + 0.3) * 0.025
	)
	var lean := Vector2(
		(sin(t * 2.2 + phase) - sin(phase)) * width.x * 0.16,
		(sin(t * 2.9 - phase) + sin(phase)) * width.y * 0.12
	)
	var crown := sin(angle * 3.0 + phase) * height * 0.028 * pow(t, 8.0) if spire else 0.0
	return Vector3(
		cos(angle) * width.x * fluting * shoulder * taper + lean.x,
		t * height - height + crown,
		sin(angle) * width.y * fluting * shoulder * taper + lean.y
	)


func build_cliff(top: Vector3, width: Vector2, height: float, spire: bool = false) -> void:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	var phase := top.x * 0.37 + top.z * 0.19
	for ring in range(14):
		for sector in range(20):
			var corners: Array[Vector3] = []
			for offset in [Vector2i(0, 0), Vector2i(1, 0), Vector2i(0, 1), Vector2i(1, 1)]:
				corners.append(
					cliff_vertex(ring + offset.y, sector + offset.x, width, height, spire, phase)
				)
			for index in [0, 2, 1, 1, 2, 3]:
				var level := float(ring) / 14.0
				var mossiness := sin(sector * 1.7 + ring * 0.9) * 0.5 + 0.5
				var color := Color("777c70").lerp(Color("b7b7a2"), level * 0.65)
				color = color.lerp(Color("526c56"), mossiness * (0.12 + level * 0.16))
				surface.set_color(color)
				var vertex_level := ring + (1 if index >= 2 else 0)
				var vertex_sector := sector + (1 if index % 2 else 0)
				var along_ring := (
					cliff_vertex(vertex_level, vertex_sector + 1, width, height, spire, phase)
					- cliff_vertex(vertex_level, vertex_sector - 1, width, height, spire, phase)
				)
				var upward := (
					cliff_vertex(
						mini(vertex_level + 1, 14), vertex_sector, width, height, spire, phase
					)
					- cliff_vertex(
						maxi(vertex_level - 1, 0), vertex_sector, width, height, spire, phase
					)
				)
				surface.set_normal(upward.cross(along_ring).normalized())
				surface.add_vertex(corners[index])
	# Close the uneven crown so flying cameras never see an open tube.
	for sector in range(20):
		for point in [
			Vector3(0, 0, 0),
			cliff_vertex(14, sector + 1, width, height, spire, phase),
			cliff_vertex(14, sector, width, height, spire, phase)
		]:
			surface.set_color(Color("7a8767"))
			surface.set_normal(Vector3.UP)
			surface.add_vertex(point)
	var cliff_material := material(Color.WHITE)
	cliff_material.vertex_color_use_as_albedo = true
	cliff_material.vertex_color_is_srgb = true
	cliff_material.albedo_texture = preload("res://assets/materials/karst_rock_original.png")
	cliff_material.uv1_triplanar = true
	cliff_material.uv1_world_triplanar = true
	cliff_material.uv1_scale = Vector3(0.18, 0.10, 0.18)
	cliff_material.normal_enabled = true
	cliff_material.normal_texture = preload("res://assets/materials/karst_rock_original_normal.png")
	cliff_material.normal_scale = 0.75
	cliff_material.roughness_texture = preload(
		"res://assets/materials/karst_rock_original_roughness.png"
	)
	cliff_material.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_GREEN
	solid(surface.commit(), top, cliff_material, false)


func terrain_height(x: float, z: float) -> float:
	var radius := maxf(absf(x), absf(z))
	var rise := smoothstep(75, 200, radius)
	return -0.8 + rise * (18 + terrain_noise.get_noise_2d(x, z) * 13)


func build_region(key: Vector2i) -> Node3D:
	var region := Node3D.new()
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for x in range(32):
		for z in range(32):
			var corners: Array[Vector3] = []
			for offset in [Vector2(0, 0), Vector2(1, 0), Vector2(0, 1), Vector2(1, 1)]:
				var px: float = key.x * 128 - 64 + (x + offset.x) * 4
				var pz: float = key.y * 128 - 64 + (z + offset.y) * 4
				corners.append(Vector3(px, terrain_height(px, pz), pz))
			for index in [0, 1, 2, 1, 3, 2]:
				var point := corners[index]
				# Shared world-space derivatives prevent flat facets and region lighting seams.
				var normal := (
					Vector3(
						(
							terrain_height(point.x - 0.5, point.z)
							- terrain_height(point.x + 0.5, point.z)
						),
						1.0,
						(
							terrain_height(point.x, point.z - 0.5)
							- terrain_height(point.x, point.z + 0.5)
						)
					)
					. normalized()
				)
				surface.set_normal(normal)
				surface.add_vertex(point)
	var terrain := MeshInstance3D.new()
	terrain.mesh = surface.commit()
	terrain.material_override = terrain_surface
	region.add_child(terrain)
	terrain.create_trimesh_collision()
	return region


func build_landscape() -> void:
	var regions = preload("res://scripts/region_streamer.gd").new()
	regions.name = "Regions"
	regions.factory = build_region
	regions.target = get_parent().get_node("Player")
	add_child(regions)
	regions.update_regions(Vector3.ZERO)
	nature = Node3D.new()
	nature.name = "GardenNature"
	add_child(nature)
	preload("res://scripts/nature.gd").new().populate(nature, SEED, terrain_height)
	for i in range(18):
		var x := -180 + i * 22
		var height := rng.randf_range(34, 82)
		build_cliff(
			Vector3(x, height, -130 - rng.randf_range(0, 90)),
			Vector2(rng.randf_range(12, 25), rng.randf_range(10, 19)),
			height + 4,
			true
		)
	build_waterfall(Vector3(-64, 0, -49.0), 21, 4.5)
	build_waterfall(Vector3(68, 0, -71.3), 30, 3.5)


func apply_quality(preset: String) -> void:
	var selected := preset.to_lower()
	if selected == "quality":
		selected = "high"
	if selected not in ["performance", "balanced", "high"]:
		selected = "balanced"
	quality_preset = selected
	var low := selected == "performance"
	var high := selected == "high"
	var sun := get_node_or_null("AfternoonSun") as DirectionalLight3D
	if sun != null:
		sun.shadow_enabled = not low
		sun.directional_shadow_max_distance = 65.0 if high else 45.0
	if nature == null:
		return
	var density := 1.0 if high else (0.42 if low else 0.72)
	for item in nature.get_children():
		if item is MultiMeshInstance3D:
			if item.get_meta("density_scaled", false):
				item.multimesh.visible_instance_count = maxi(
					1, floori(item.multimesh.instance_count * density)
				)
			var near_cover: bool = item.get_meta("near_cover", false)
			item.visibility_range_end = (
				(58.0 if low else (95.0 if high else 75.0))
				if near_cover
				else (110.0 if low else (210.0 if high else 160.0))
			)
