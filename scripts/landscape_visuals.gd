extends RefCounted
## Authored architecture support, stair collision and inexpensive water detail.

var world: Node3D


func build_route(target: Node3D) -> void:
	world = target
	var route := Node3D.new()
	route.name = "SkyRoute"
	world.add_child(route)
	var body := StaticBody3D.new()
	body.name = "WalkableSkyStairs"
	route.add_child(body)
	var stone_blocks: Array[Transform3D] = []
	add_box(body, stone_blocks, Vector3(16, 0.8, 8), Vector3(46, -0.4, -4))
	for index in range(50):
		var height := (index + 1) * 0.20
		add_box(
			body,
			stone_blocks,
			Vector3(4, height, 1.10 if index == 0 else 0.55),
			Vector3(50, height / 2, -4.0 if index == 0 else -4.275 - index * 0.55)
		)
	# The front edge contains a stair notch. A solid full-width slab here would put
	# its 10m wall across the final five risers and silently break the route.
	add_box(body, stone_blocks, Vector3(10, 1, 20), Vector3(43, 9.5, -39))
	add_box(body, stone_blocks, Vector3(2, 1, 20), Vector3(53, 9.5, -39))
	add_box(body, stone_blocks, Vector3(4, 1, 17.5), Vector3(50, 9.5, -40.25))
	var cubes := BoxMesh.new()
	cubes.size = Vector3.ONE
	batch(route, "FiftyStoneRisers", cubes, stone_blocks, world.stone)
	# Two long stone strings support the exposed run; the walking lane remains4m.
	for x in [47.72, 52.28]:
		var support: MeshInstance3D = world.block(
			Vector3(0.36, 0.42, 29.35), Vector3(x, 5.08, -17.75), world.pale_stone, false
		)
		support.rotation.x = atan2(10.0, 27.5)
		var guard_shape := CollisionShape3D.new()
		var guard := BoxShape3D.new()
		guard.size = Vector3(0.36, 1.1, 29.25)
		guard_shape.shape = guard
		guard_shape.position = Vector3(x, 5.55, -17.75)
		guard_shape.rotation.x = support.rotation.x
		body.add_child(guard_shape)
	var posts: Array[Transform3D] = []
	var rails: Array[Transform3D] = []
	for x in [47.65, 52.35]:
		for index in range(11):
			var progress := index / 10.0
			posts.append(
				Transform3D(
					Basis.IDENTITY.scaled(Vector3(0.18, 1.15, 0.18)),
					Vector3(x, progress * 10 + 0.58, -4 - progress * 27.5)
				)
			)
		rails.append(
			Transform3D(
				Basis(Vector3.RIGHT, atan2(10.0, 27.5)).scaled(Vector3(0.12, 0.12, 29.26)),
				Vector3(x, 6.0, -17.75)
			)
		)
	batch(route, "SkyStairPosts", cubes, posts, world.red_wood)
	batch(route, "SkyStairHandrails", cubes, rails, world.gold)
	# Thick irregular support gives the destination a land mass rather than a
	# floating rectangular plate. Decorative rock never replaces walkable boxes.
	world.build_cliff(Vector3(44, 9.35, -40), Vector2(10.3, 11.7), 13.0)
	for index in [10, 20, 30, 40]:
		for x in [47.65, 52.35]:
			world.module_at("lantern", Vector3(x, index * 0.2 + 1.15, -4 - index * 0.55), 0.58)
	world.module_at("pagoda", Vector3(46, 10, -42), 1.0)
	world.module_at("lantern", Vector3(47, 10, -32.5), 0.8)
	world.module_at("lantern", Vector3(53, 10, -32.5), 0.8)


func add_box(
	body: StaticBody3D, transforms: Array[Transform3D], size_value: Vector3, position: Vector3
) -> void:
	transforms.append(Transform3D(Basis.IDENTITY.scaled(size_value), position))
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = size_value
	shape.shape = box
	shape.position = position
	body.add_child(shape)


func batch(
	parent: Node3D, label: String, mesh: Mesh, transforms: Array[Transform3D], material: Material
) -> MultiMeshInstance3D:
	var multi := MultiMesh.new()
	multi.transform_format = MultiMesh.TRANSFORM_3D
	multi.mesh = mesh
	multi.instance_count = transforms.size()
	for index in range(transforms.size()):
		multi.set_instance_transform(index, transforms[index])
	var item := MultiMeshInstance3D.new()
	item.name = label
	item.multimesh = multi
	item.material_override = material
	item.visibility_range_end = 220
	parent.add_child(item)
	return item


func build_shoreline(target: Node3D) -> void:
	world = target
	var shoreline := Node3D.new()
	shoreline.name = "LotusShoreline"
	world.add_child(shoreline)
	var stones: Array[Transform3D] = []
	var reeds: Array[Transform3D] = []
	var mesh := SphereMesh.new()
	mesh.radial_segments = 10
	mesh.rings = 4
	mesh.radius = 1.0
	mesh.height = 2.0
	for index in range(44):
		var angle := index * TAU / 44.0
		var point := Vector3(-34 + cos(angle) * 12.3, -0.35, sin(angle) * 15.7)
		# Keep the bridge and north/south waterfront routes clear.
		if absf(point.z - 1) < 5 and point.x > -35:
			continue
		var size_value: float = world.rng.randf_range(0.38, 0.85)
		stones.append(
			Transform3D(
				Basis.from_euler(Vector3(0.12, angle, 0.1)).scaled(
					Vector3(size_value, size_value * 0.50, size_value * 0.8)
				),
				point
			)
		)
		for stalk in range(4):
			var height: float = world.rng.randf_range(0.45, 1.1)
			reeds.append(
				Transform3D(
					Basis.from_euler(Vector3(0.1, angle + stalk, 0.12)).scaled(
						Vector3(0.035, height, 0.035)
					),
					point + Vector3(sin(stalk) * 0.35, height * 0.45, cos(stalk) * 0.3)
				)
			)
	batch(shoreline, "WetShoreRocks", mesh, stones, world.dark_stone)
	var reed := CylinderMesh.new()
	reed.top_radius = 0.05
	reed.bottom_radius = 0.8
	reed.height = 1.0
	reed.radial_segments = 4
	var stems := batch(shoreline, "WaterReeds", reed, reeds, world.material(Color("55734a")))
	stems.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF


func build_water_detail(target: Node3D, origin: Vector3, width: float) -> void:
	world = target
	var container := Node3D.new()
	container.name = "WaterfallImpact"
	world.add_child(container)
	var foam: StandardMaterial3D = world.material(Color("d5e9db"), 0.68)
	var ring := TorusMesh.new()
	ring.inner_radius = 0.70
	ring.outer_radius = 1.0
	ring.rings = 24
	ring.ring_segments = 5
	var rings: Array[Transform3D] = []
	for index in range(3):
		var radius := width * (0.35 + index * 0.20)
		rings.append(
			Transform3D(
				Basis.IDENTITY.scaled(Vector3(radius, 0.035, radius * 0.55)),
				origin + Vector3(0, 0.005 + index * 0.006, 0.9)
			)
		)
	var foam_ring := batch(container, "ImpactFoamRings", ring, rings, foam)
	foam_ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var mist := ShaderMaterial.new()
	mist.shader = preload("res://assets/shaders/water_spray.gdshader")
	var puff := QuadMesh.new()
	puff.size = Vector2(width * 1.25, width * 0.75)
	var spray: Array[Transform3D] = []
	for index in range(4):
		spray.append(
			Transform3D(
				Basis.IDENTITY,
				(
					origin
					+ Vector3(
						(index - 1.5) * width * 0.34, 0.55 + (index % 2) * 0.3, 0.7 + index * 0.4
					)
				)
			)
		)
	var mist_batch := batch(container, "WaterfallSpray", puff, spray, mist)
	mist_batch.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	mist_batch.set_meta("water_detail", true)
	mist_batch.visibility_range_end = 130
