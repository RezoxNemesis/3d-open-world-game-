extends RefCounted
## Seeded rooted boughs, pergola wisteria and layered original botanical detail.

var rng := RandomNumberGenerator.new()
var nature


func populate(builder: RefCounted, parent: Node3D, seed_value: int) -> void:
	nature = builder
	rng.seed = seed_value
	_ancient_tree(parent)
	_wisteria(parent)
	_planted_edges(parent)
	_forest_floor(parent)


func _branch(
	transforms: Array[Transform3D],
	colors: Array[Color],
	start: Vector3,
	end: Vector3,
	radius: float
) -> void:
	transforms.append(nature.branch_transform(start, end, radius))
	colors.append(Color("8c8266").lerp(Color("beb492"), rng.randf() * 0.55))


func _card(point: Vector3, size: Vector3, yaw: float = 0.0) -> Transform3D:
	return Transform3D(
		(
			Basis
			. from_euler(Vector3(rng.randf_range(-0.35, 0.35), yaw, rng.randf_range(-0.25, 0.25)))
			. scaled(size)
		),
		point
	)


func _ancient_tree(parent: Node3D) -> void:
	var boughs: Array[Transform3D] = []
	var bark: Array[Color] = []
	var leaves: Array[Transform3D] = []
	var leaf_colors: Array[Color] = []
	var root: Vector3 = nature.ground(Vector3(-18, 0, 14))
	var joints: Array[Vector3] = [
		root,
		root + Vector3(0.8, 2.1, 0.15),
		root + Vector3(-0.3, 4.3, -0.5),
		root + Vector3(0.75, 6.0, -0.2),
		root + Vector3(0.25, 8.4, 0.8)
	]
	for index in range(4):
		_branch(boughs, bark, joints[index], joints[index + 1], 0.82 - index * 0.15)
	for index in range(8):
		var angle := index * TAU / 8 + 0.18
		var outward := Vector3(cos(angle), 0, sin(angle))
		var root_tip: Vector3 = nature.ground(root + outward * rng.randf_range(2.3, 3.8))
		var knee := root.lerp(root_tip, 0.45) + Vector3.UP * 0.35
		_branch(boughs, bark, root + Vector3.UP * 0.5, knee, 0.29)
		_branch(boughs, bark, knee, root_tip + Vector3.UP * 0.06, 0.17)
		var start := joints[2 if index % 2 == 0 else 3]
		var elbow := start + outward * 2.5 + Vector3.UP * rng.randf_range(0.1, 1.0)
		var tip := elbow + outward * rng.randf_range(1.8, 2.8) + Vector3.UP * 1.3
		_branch(boughs, bark, start, elbow, 0.25)
		_branch(boughs, bark, elbow, tip, 0.14)
		for twig in range(3):
			var twist := angle + (twig - 1) * 0.7
			var end := tip + Vector3(cos(twist), 0.7, sin(twist)) * 1.05
			_branch(boughs, bark, tip, end, 0.065)
			for cluster in range(12):
				var point := (
					end
					+ Vector3(
						rng.randf_range(-1.0, 1.0),
						rng.randf_range(-0.3, 0.8),
						rng.randf_range(-1.0, 1.0)
					)
				)
				leaves.append(_card(point, Vector3(1.7, 1.25, 1.6), rng.randf() * TAU))
				leaf_colors.append(Color("91a77b").lerp(Color("d0d6a5"), rng.randf() * 0.6))
			nature._camera_canopy(parent, end, 1.05)
	nature.batch(parent, "AncientBoughs", nature._bark_mesh(), boughs, bark)
	nature.batch(parent, "AncientLeaves", nature._atlas_mesh(0), leaves, leaf_colors, true)


func _wisteria(parent: Node3D) -> void:
	var vines: Array[Transform3D] = []
	var bark: Array[Color] = []
	var leaves: Array[Transform3D] = []
	var leaf_colors: Array[Color] = []
	var flowers: Array[Transform3D] = []
	var flower_colors: Array[Color] = []
	for side in [-1, 1]:
		var center := Vector3(side * 13.5, 4.18, 8)
		for edge in [-1, 1]:
			var x: float = center.x + edge * 2.35
			var root := Vector3(x, 0.34, 4.35)
			var bend := root + Vector3(0.16 * edge, 1.8, 0.15)
			_branch(vines, bark, root, bend, 0.075)
			_branch(vines, bark, bend, Vector3(x, 4.18, 4.35), 0.052)
			_branch(vines, bark, Vector3(x, 4.18, 4.35), Vector3(x, 4.18, 11.65), 0.045)
		for index in range(90):
			var point := (
				center
				+ Vector3(
					rng.randf_range(-2.3, 2.3),
					rng.randf_range(0.0, 0.32),
					rng.randf_range(-3.45, 3.45)
				)
			)
			leaves.append(_card(point, Vector3(1.0, 0.62, 1.0), rng.randf() * TAU))
			leaf_colors.append(Color("72916a").lerp(Color("b6bd83"), rng.randf() * 0.7))
		for index in range(45):
			var x := center.x + (-1 if index % 2 == 0 else 1) * rng.randf_range(1.8, 2.45)
			var origin := Vector3(x, 4.16, center.z + rng.randf_range(-3.5, 3.5))
			var length := rng.randf_range(0.62, 1.25)
			_branch(vines, bark, origin, origin - Vector3.UP * length, 0.012)
			for tier in range(5):
				var progress := tier / 4.0
				var width := lerpf(0.42, 0.12, progress)
				flowers.append(
					_card(
						origin - Vector3.UP * (progress * length),
						Vector3(width, 0.35, width),
						rng.randf() * TAU
					)
				)
				flower_colors.append(Color("c3a0e0").lerp(Color("ebe0f2"), rng.randf() * 0.45))
	nature.batch(parent, "WisteriaVines", nature._bark_mesh(), vines, bark)
	nature.batch(parent, "WisteriaLeaves", nature._atlas_mesh(0), leaves, leaf_colors, true)
	nature.batch(parent, "WisteriaRacemes", nature.petal_mesh(), flowers, flower_colors, true)


func _planted_edges(parent: Node3D) -> void:
	var leaves: Array[Transform3D] = []
	var leaf_colors: Array[Color] = []
	var flowers: Array[Transform3D] = []
	var flower_colors: Array[Color] = []
	for side in [-1, 1]:
		for index in range(34):
			var root := Vector3(
				side * 13 + rng.randf_range(-2.65, 2.65), 0.32, rng.randf_range(3.5, 10.4)
			)
			for layer in range(4):
				var point := (
					root
					+ Vector3(
						rng.randf_range(-0.25, 0.25),
						0.38 + layer * 0.12,
						rng.randf_range(-0.25, 0.25)
					)
				)
				leaves.append(_card(point, Vector3(1.05, 0.8, 1.0), rng.randf() * TAU))
				leaf_colors.append(Color("6a8d59").lerp(Color("afb882"), rng.randf() * 0.65))
			if index % 3 == 0:
				flowers.append(
					_card(root + Vector3.UP * 0.65, Vector3(0.65, 0.55, 0.65), rng.randf() * TAU)
				)
				flower_colors.append(Color("e4c3c4"))
	nature.batch(parent, "PlantedEdgeLeaves", nature._atlas_mesh(0), leaves, leaf_colors, true)
	nature.batch(parent, "PlantedEdgeFlowers", nature.petal_mesh(), flowers, flower_colors, true)


func _ground_mesh(petal: bool) -> ArrayMesh:
	var builder := SurfaceTool.new()
	builder.begin(Mesh.PRIMITIVE_TRIANGLES)
	var sides := 5 if petal else 9
	for index in range(sides):
		for point in [
			Vector3(0, 0.025, 0),
			(
				Vector3(cos(index * TAU / sides), 0, sin(index * TAU / sides))
				* (0.75 if index % 2 else 1.0)
			),
			(
				Vector3(cos((index + 1) * TAU / sides), 0, sin((index + 1) * TAU / sides))
				* (0.75 if (index + 1) % 2 else 1.0)
			)
		]:
			builder.add_vertex(point)
	builder.generate_normals()
	builder.set_material(nature.surface(Color.WHITE))
	return builder.commit()


func _forest_floor(parent: Node3D) -> void:
	var ferns: Array[Transform3D] = []
	var fern_colors: Array[Color] = []
	var moss: Array[Transform3D] = []
	var moss_colors: Array[Color] = []
	var petals: Array[Transform3D] = []
	var petal_colors: Array[Color] = []
	var shrubs: Array[Transform3D] = []
	var shrub_colors: Array[Color] = []
	for index in range(300):
		var point := Vector3(rng.randf_range(-72, 72), 0, rng.randf_range(-68, 35))
		if nature.route_or_water(point):
			continue
		point = nature.ground(point)
		var width := rng.randf_range(0.45, 1.1)
		moss.append(
			Transform3D(
				Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(width, 1, width * 0.7)),
				point + Vector3.UP * 0.025
			)
		)
		moss_colors.append(Color("466142").lerp(Color("788456"), rng.randf() * 0.8))
		if index % 5 != 0 or point.length() < 23:
			continue
		ferns.append(_card(point, Vector3.ONE * rng.randf_range(1.0, 1.6), rng.randf() * TAU))
		fern_colors.append(Color("527455"))
		for layer in range(3):
			shrubs.append(
				_card(
					point + Vector3.UP * (0.35 + layer * 0.18),
					Vector3(1.4, 1.0, 1.4),
					rng.randf() * TAU
				)
			)
			shrub_colors.append(Color("8a9c70"))
	for side in [-1, 1]:
		for index in range(120):
			var point := Vector3(
				side * 13 + rng.randf_range(-2.8, 2.8), 0, 7 + rng.randf_range(-3.4, 3.4)
			)
			if nature.route_or_water(point):
				continue
			point = nature.ground(point) + Vector3.UP * 0.025
			var width := rng.randf_range(0.025, 0.065)
			petals.append(
				Transform3D(
					Basis(Vector3.UP, rng.randf() * TAU).scaled(Vector3(width, 1, width * 0.7)),
					point
				)
			)
			petal_colors.append(Color("d5aeb9").lerp(Color("e9d9ce"), rng.randf() * 0.7))
	nature.batch(parent, "ForestUnderstory", nature.fern_mesh(), ferns, fern_colors, true)
	nature.batch(parent, "ForestLeafClumps", nature._atlas_mesh(0), shrubs, shrub_colors, true)
	nature.batch(parent, "MossCarpets", _ground_mesh(false), moss, moss_colors, true)
	nature.batch(parent, "FallenPetals", _ground_mesh(true), petals, petal_colors, true)
