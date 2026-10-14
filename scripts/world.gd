extends Node3D
## Deterministic, bounded courtyard. Replace regions independently as the world grows.

const SEED := 73109
var rng := RandomNumberGenerator.new()
var stone: StandardMaterial3D
var dark_stone: StandardMaterial3D
var moss: StandardMaterial3D
var leaf: StandardMaterial3D
var gold: StandardMaterial3D


func material(color: Color, roughness: float = 0.9) -> StandardMaterial3D:
	var result := StandardMaterial3D.new()
	result.albedo_color = color
	result.roughness = roughness
	return result


func _ready() -> void:
	rng.seed = SEED
	stone = material(Color("a89775"))
	dark_stone = material(Color("605f53"))
	moss = material(Color("64724c"))
	leaf = material(Color("365742"))
	gold = material(Color("baa46a"), 0.45)
	setup_sky()
	build_courtyard()
	build_temple()
	build_landscape()


func solid(
	mesh: Mesh, location: Vector3, surface: Material, collision: bool = true
) -> MeshInstance3D:
	var item := MeshInstance3D.new()
	item.mesh = mesh
	item.material_override = surface
	item.position = location
	item.visibility_range_end = 120
	add_child(item)
	if collision:
		item.create_trimesh_collision()
	return item


func block(
	size: Vector3, location: Vector3, surface: Material, collision: bool = true
) -> MeshInstance3D:
	var mesh := BoxMesh.new()
	mesh.size = size
	return solid(mesh, location, surface, collision)


func column(location: Vector3, height: float = 5.5) -> void:
	block(Vector3(1.6, 0.35, 1.6), location + Vector3(0, 0.18, 0), dark_stone)
	var mesh := CylinderMesh.new()
	mesh.top_radius = 0.43
	mesh.bottom_radius = 0.58
	mesh.height = height
	mesh.radial_segments = 16
	solid(mesh, location + Vector3(0, height / 2 + 0.35, 0), stone)
	for level in [0.5, height - 0.1]:
		var ring := TorusMesh.new()
		ring.inner_radius = 0.44
		ring.outer_radius = 0.68
		solid(ring, location + Vector3(0, level + 0.35, 0), gold, false)
	block(Vector3(1.5, 0.4, 1.5), location + Vector3(0, height + 0.6, 0), stone)


func setup_sky() -> void:
	var environment := WorldEnvironment.new()
	var settings := Environment.new()
	settings.background_mode = Environment.BG_SKY
	var sky := Sky.new()
	var sky_material := ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color("425d72")
	sky_material.sky_horizon_color = Color("d4bea0")
	sky_material.ground_horizon_color = Color("a18b69")
	sky_material.ground_bottom_color = Color("303d35")
	sky.sky_material = sky_material
	settings.sky = sky
	settings.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	settings.ambient_light_color = Color("8cabb0")
	settings.ambient_light_energy = 0.35
	settings.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.environment = settings
	add_child(environment)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-42, -32, 0)
	sun.light_color = Color("ffe0a9")
	sun.light_energy = 0.95
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 80
	add_child(sun)


func build_courtyard() -> void:
	block(Vector3(40, 0.8, 40), Vector3(0, -0.4, 0), dark_stone)
	for x in range(-8, 8):
		for z in range(-8, 8):
			if abs(x) <= 1 and z < 1 and z > -4:
				continue
			var surface := stone if rng.randf() > 0.20 else moss
			block(Vector3(1.94, 0.08, 1.94), Vector3(x * 2 + 1, 0.04, z * 2 + 1), surface, false)
	for x in [-20, 20]:
		block(Vector3(1, 2.5, 40), Vector3(x, 1.25, 0), dark_stone)
	block(Vector3(40, 2.5, 1), Vector3(0, 1.25, 20), dark_stone)
	block(Vector3(40, 2.5, 1), Vector3(0, 1.25, -20), dark_stone)
	# Shallow ornamental pool; physical bottom lies beneath translucent water.
	block(Vector3(5.8, 0.28, 7.8), Vector3(0, 0.14, -2), dark_stone)
	var water := material(Color(0.15, 0.42, 0.43, 0.75), 0.15)
	water.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	block(Vector3(5.2, 0.04, 7.2), Vector3(0, 0.32, -2), water, false)
	for x in [-3.2, 3.2]:
		block(Vector3(0.55, 0.6, 8.6), Vector3(x, 0.3, -2), stone)
	for z in [-6.3, 2.3]:
		block(Vector3(6.9, 0.6, 0.55), Vector3(0, 0.3, z), stone)
	for x in [-14, 14]:
		for z in [-12, -4, 4, 12]:
			column(Vector3(x, 0, z), 4.5 if z != 4 else 3.0)
		block(Vector3(1.2, 0.65, 25), Vector3(x, 5.3, -0.5), stone)
	for x in [-9, 9]:
		for z in [-4, 5]:
			block(Vector3(1.2, 1.0, 1.2), Vector3(x, 0.5, z), dark_stone)
			var fire := OmniLight3D.new()
			fire.position = Vector3(x, 1.5, z)
			fire.light_color = Color("ffae52")
			fire.light_energy = 2
			fire.omni_range = 4
			add_child(fire)
			var orb := SphereMesh.new()
			orb.radius = 0.18
			orb.height = 0.36
			var glow := material(Color("ffd77e"))
			glow.emission_enabled = true
			glow.emission = Color("ffba53")
			glow.emission_energy_multiplier = 3
			solid(orb, fire.position, glow, false)


func build_temple() -> void:
	# Eight shallow steps, each reachable by CharacterBody3D jumping.
	for i in range(8):
		block(Vector3(9, (i + 1) * 0.22, 0.9), Vector3(0, (i + 1) * 0.11, -8 - i * 0.85), stone)
	block(Vector3(14, 1.76, 6), Vector3(0, 0.88, -16), dark_stone)
	for x in [-5.5, -2.5, 2.5, 5.5]:
		column(Vector3(x, 1.76, -14.8), 5)
	block(Vector3(15, 0.7, 2.2), Vector3(0, 7.7, -14.8), stone)
	block(Vector3(12, 4, 0.8), Vector3(0, 3.76, -18.5), dark_stone)
	# Triangular stone pediment with repeated terraced cornice.
	for i in range(7):
		block(Vector3(14 - i * 1.8, 0.35, 1.5), Vector3(0, 8.2 + i * 0.35, -14.8), stone)
	for x in [-4, 4]:
		block(Vector3(1.3, 2.6, 0.3), Vector3(x, 4, -18), gold, false)
	column(Vector3(0, 1.76, -17), 2.2)


func build_landscape() -> void:
	var regions = preload("res://scripts/region_streamer.gd").new()
	regions.name = "Regions"
	regions.factory = build_region
	regions.target = get_parent().get_node("Player")
	add_child(regions)
	regions.update_regions(Vector3.ZERO)
	for i in range(65):
		var x := rng.randf_range(-18, 18)
		var z := rng.randf_range(-18, 18)
		if absf(x) < 8:
			continue
		var location := Vector3(x, 0.1, z)
		if i % 3 == 0:
			var rock := SphereMesh.new()
			rock.radius = rng.randf_range(0.4, 1.1)
			rock.height = rock.radius * 1.4
			rock.radial_segments = 7
			rock.rings = 3
			var item := solid(rock, location, dark_stone)
			item.rotation = Vector3(rng.randf(), rng.randf(), rng.randf())
		else:
			var trunk := CylinderMesh.new()
			trunk.top_radius = 0.08
			trunk.bottom_radius = 0.16
			trunk.height = 1.8
			solid(trunk, location + Vector3(0, 0.9, 0), dark_stone, false)
			for layer in range(3):
				var crown := CylinderMesh.new()
				crown.top_radius = 0.05
				crown.bottom_radius = 1.2 - layer * 0.25
				crown.height = 1.6
				crown.radial_segments = 7
				solid(crown, location + Vector3(0, 1.5 + layer * 0.7, 0), leaf, false)


func build_region(key: Vector2i) -> Node3D:
	var region := Node3D.new()
	var noise := FastNoiseLite.new()
	noise.seed = SEED
	noise.frequency = 0.065
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for x in range(16):
		for z in range(16):
			var corners: Array[Vector3] = []
			for offset in [Vector2(0, 0), Vector2(1, 0), Vector2(0, 1), Vector2(1, 1)]:
				var px: float = key.x * 128 - 64 + (x + offset.x) * 8
				var pz: float = key.y * 128 - 64 + (z + offset.y) * 8
				var radius := maxf(absf(px), absf(pz))
				var height := (
					-0.7
					if radius < 24
					else maxf(0, radius - 24) * 0.20 + noise.get_noise_2d(px, pz) * 5
				)
				corners.append(Vector3(px, height, pz))
			for index in [0, 1, 2, 1, 3, 2]:
				surface.add_vertex(corners[index])
	surface.generate_normals()
	var terrain := MeshInstance3D.new()
	terrain.mesh = surface.commit()
	terrain.material_override = moss
	region.add_child(terrain)
	terrain.create_trimesh_collision()
	return region
