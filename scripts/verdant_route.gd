extends RefCounted
## Western walking route. Geometry and collision share exact meter dimensions.

const LANDSCAPE := preload("res://scripts/landscape_visuals.gd")
var world: Node3D
var route: Node3D
var helper := LANDSCAPE.new()


func build(target: Node3D) -> void:
	world = target
	route = Node3D.new()
	route.name = "FoxShrineRoute"
	world.add_child(route)
	var body := StaticBody3D.new()
	body.name = "WalkableFoxRoute"
	route.add_child(body)
	var cubes := BoxMesh.new()
	cubes.size = Vector3.ONE
	var paving: Array[Transform3D] = []
	# This extension touches the old lotus bridge's zero-meter approach floor.
	helper.add_box(body, paving, Vector3(3.6, 0.45, 5), Vector3(-30, -0.225, -1))
	var risers: Array[Transform3D] = []
	for index in range(30):
		var height := (index + 1) * 0.20
		helper.add_box(
			body,
			risers,
			Vector3(3.6, height, 0.55),
			Vector3(-30, height / 2, -3.775 - index * 0.55)
		)
	helper.batch(route, "ThirtyStoneRisers", cubes, risers, world.stone)
	# Half a meter of top landing resolves the exact -20.5m bridge start.
	helper.add_box(body, paving, Vector3(3.6, 0.48, 0.5), Vector3(-30, 5.76, -20.25))
	helper.add_box(body, paving, Vector3(5.2, 0.34, 16), Vector3(-30, 5.83, -28.5))
	helper.add_box(body, paving, Vector3(18, 0.65, 16), Vector3(-32, 5.675, -42))
	# Imported deck/floor skins sit at exactly six meters. Their underlying stone
	# remains a centimeter lower to avoid competing coplanar faces.
	var paving_skin: Array[Transform3D] = []
	for placement in paving:
		placement.origin.y -= 0.012
		paving_skin.append(placement)
	helper.batch(route, "FoxRoutePaving", cubes, paving_skin, world.stone)
	build_stair_guards(body, cubes)
	build_bridge(body, cubes)
	build_terrace(body, cubes)
	# Rock supports follow the ascent and fill the terrace's entire underside.
	world.build_cliff(Vector3(-32, 5.55, -42), Vector2(10.5, 9.0), 8.0)
	world.build_cliff(Vector3(-35.7, 2.45, -18), Vector2(4.8, 6.0), 5.4)
	for placement in [
		Vector3(-32.2, 1.2, -6.7), Vector3(-32.2, 3.2, -12.2), Vector3(-32.2, 5.2, -17.7)
	]:
		world.module_at("lantern", placement, 0.58)


func build_stair_guards(body: StaticBody3D, cubes: BoxMesh) -> void:
	var timber: Array[Transform3D] = []
	var trim: Array[Transform3D] = []
	var angle := atan2(6.0, 16.5)
	var length_value := Vector2(16.5, 6.0).length()
	for x in [-32.03, -27.97]:
		var guard := CollisionShape3D.new()
		var shape := BoxShape3D.new()
		shape.size = Vector3(0.20, 1.25, length_value + 0.6)
		guard.shape = shape
		guard.position = Vector3(x, 3.6, -11.75)
		guard.rotation.x = angle
		body.add_child(guard)
		for index in range(11):
			var progress := index / 10.0
			timber.append(
				Transform3D(
					Basis.IDENTITY.scaled(Vector3(0.16, 1.1, 0.16)),
					Vector3(x, progress * 6 + 0.55, -3.5 - progress * 16.5)
				)
			)
		for height in [0.50, 1.08]:
			trim.append(
				Transform3D(
					Basis(Vector3.RIGHT, angle).scaled(Vector3(0.12, 0.12, length_value)),
					Vector3(x, 3 + height, -11.75)
				)
			)
	helper.batch(route, "FoxStairPosts", cubes, timber, world.red_wood)
	helper.batch(route, "FoxStairRails", cubes, trim, world.gold)


func build_bridge(body: StaticBody3D, cubes: BoxMesh) -> void:
	var supports: Array[Transform3D] = []
	var guards: Array[Transform3D] = []
	var invisible: Array[Transform3D] = []
	for center_z in [-24.5, -32.5]:
		var module: Node3D = world.module_at("covered_bridge", Vector3(-30, 6, center_z))
		module.reparent(route)
		module.name = "CoveredBridgeSouth" if center_z == -24.5 else "CoveredBridgeNorth"
		for x in [-32.4, -27.6]:
			for z in [center_z - 3.8, center_z + 3.8]:
				helper.add_box(body, invisible, Vector3(0.24, 2.9, 0.24), Vector3(x, 7.45, z))
				supports.append(
					Transform3D(Basis.IDENTITY.scaled(Vector3(0.50, 5.8, 0.56)), Vector3(x, 2.8, z))
				)
	for x in [-31.98, -28.02]:
		helper.add_box(body, invisible, Vector3(0.18, 1.08, 16.0), Vector3(x, 6.54, -28.5))
		for y in [6.48, 7.0]:
			guards.append(
				Transform3D(Basis.IDENTITY.scaled(Vector3(0.10, 0.10, 16.0)), Vector3(x, y, -28.5))
			)
	helper.batch(route, "BridgeStonePiers", cubes, supports, world.dark_stone)
	helper.batch(route, "BridgeLaneGuards", cubes, guards, world.red_wood)


func build_terrace(body: StaticBody3D, cubes: BoxMesh) -> void:
	var rails: Array[Transform3D] = []
	var invisible: Array[Transform3D] = []
	# Rail gaps coincide with the bridge's 3.6m clear walking lane.
	for side in [Vector3(-41.0, 6.55, -42), Vector3(-23.0, 6.55, -42)]:
		helper.add_box(body, rails, Vector3(0.22, 1.1, 16), side)
	helper.add_box(body, rails, Vector3(18, 1.1, 0.22), Vector3(-32, 6.55, -50))
	helper.add_box(body, rails, Vector3(9.2, 1.1, 0.22), Vector3(-36.4, 6.55, -34))
	helper.add_box(body, rails, Vector3(5.2, 1.1, 0.22), Vector3(-25.6, 6.55, -34))
	helper.batch(route, "TerraceStoneGuards", cubes, rails, world.dark_stone)
	var shrine: Node3D = world.module_at("fox_shrine", Vector3(-32, 6, -43))
	shrine.reparent(route)
	shrine.name = "FoxShrine"
	# Walls/posts use simple physical boxes rather than the ornament triangles.
	for x in [-36.15, -27.85]:
		helper.add_box(body, invisible, Vector3(0.28, 3.0, 0.28), Vector3(x, 7.5, -40.1))
		helper.add_box(body, invisible, Vector3(0.28, 3.0, 0.28), Vector3(x, 7.5, -45.9))
	helper.add_box(body, invisible, Vector3(8.3, 2.8, 0.20), Vector3(-32, 7.4, -45.9))
	for x in [-36.15, -27.85]:
		helper.add_box(body, invisible, Vector3(0.20, 2.8, 5.8), Vector3(x, 7.4, -43))
