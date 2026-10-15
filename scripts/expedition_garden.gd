extends RefCounted
## Original layered sanctuary botany. Meter-scale geometry; shared painted project atlas.

const NATURE := preload("res://scripts/nature.gd")
const WATER_HEIGHT := 0.105
var _nature := NATURE.new()
var _rng := RandomNumberGenerator.new()
var _records: Dictionary = {}
var _meshes: Dictionary = {}


func build(parent: Node3D) -> Node3D:
	var existing := parent.get_node_or_null("ExpeditionGarden") as Node3D
	if existing != null:
		return existing
	_rng.seed = 702601
	_records.clear()
	_meshes = {
		"Boughs": _nature._bark_mesh(),
		"Sakura": _nature.petal_mesh(),
		"Leaves": _nature._atlas_mesh(0),
		"Wisteria": _nature.petal_mesh(),
		"Bamboo": _bamboo_mesh(),
		"BambooLeaves": _nature._atlas_mesh(2),
		"Ferns": _nature.fern_mesh(),
		"Moss": _pad_mesh(false),
		"LotusPads": _pad_mesh(true),
		"LotusFlowers": _lotus_mesh(),
		"BankStones": _stone_mesh()
	}
	var garden := Node3D.new()
	garden.name = "ExpeditionGarden"
	parent.add_child(garden)
	_tree(Vector3(-13, 0, 8), 7.8, 4.3, true)
	_tree(Vector3(-30, 0, -17), 8.8, 4.7, true)
	_tree(Vector3(-29, 0, 17), 7.0, 4.1, true)
	_tree(Vector3(-34, 0, 6), 9.5, 4.6, false)
	_tree(Vector3(14, 0, -8), 8.4, 4.0, true)
	_tree(Vector3(31, 0, 18), 9.0, 5.0, false)
	_tree(Vector3(8, 0, 27), 8.0, 4.3, true)
	_bamboo(Vector3(34, 0, -8))
	_bamboo(Vector3(-35, 0, -13))
	_bamboo(Vector3(-35, 0, 16))
	_bamboo(Vector3(-11, 0, 22))
	_banks()
	_lotus()
	for label: String in _records:
		var record: Dictionary = _records[label]
		_nature.batch_group(
			garden,
			label,
			_meshes[label],
			record.transforms,
			record.colors,
			label in ["Sakura", "Leaves", "Wisteria", "BambooLeaves", "Ferns"]
		)
		var batch := garden.get_child(garden.get_child_count() - 1) as MultiMeshInstance3D
		# Dense leaf cards cast many redundant alpha-tested shadows. Trunks retain
		# the strong silhouette shadow; all fine garden detail stays one color pass.
		batch.cast_shadow = (
			GeometryInstance3D.SHADOW_CASTING_SETTING_ON
			if label == "Boughs"
			else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		)
		batch.visibility_range_end = 145
	_records.clear()
	return garden


func _add(label: String, placement: Transform3D, color: Color) -> void:
	if not _records.has(label):
		_records[label] = {"transforms": [] as Array[Transform3D], "colors": [] as Array[Color]}
	_records[label].transforms.append(placement)
	_records[label].colors.append(color)


func _card(label: String, point: Vector3, size: Vector3, color: Color) -> void:
	var basis := Basis.from_euler(
		Vector3(_rng.randf_range(-0.65, 0.65), _rng.randf() * TAU, _rng.randf_range(-0.35, 0.35))
	)
	_add(label, Transform3D(basis.scaled(size), point), color)


func _branch(start: Vector3, finish: Vector3, radius: float, label := "Boughs") -> void:
	var tint := Color("81735a").lerp(Color("b6aa8b"), _rng.randf() * 0.55)
	if label == "Bamboo":
		tint = Color("667b42").lerp(Color("a5ac6c"), _rng.randf() * 0.55)
	_add(label, _nature.branch_transform(start, finish, radius), tint)


func _tree(root: Vector3, height: float, spread: float, blossom: bool) -> void:
	var lean := Vector3(_rng.randf_range(-0.9, 0.9), 0, _rng.randf_range(-0.8, 0.8))
	var joints: Array[Vector3] = [root]
	for index in range(1, 5):
		var t := index / 4.0
		var point := root + Vector3.UP * height * t + lean * sin(t * PI)
		_branch(joints[-1], point, lerpf(0.48, 0.14, t))
		joints.append(point)
	for index in range(10):
		var angle := index * 2.399 + _rng.randf_range(-0.2, 0.2)
		var outward := Vector3(cos(angle), 0, sin(angle))
		var start := joints[2 + index % 2]
		var elbow := start + outward * spread * 0.55 + Vector3.UP * 0.25
		var tip := root + outward * spread * _rng.randf_range(0.7, 1.0)
		tip.y += height * _rng.randf_range(0.82, 1.07)
		_branch(start, elbow, 0.16)
		_branch(elbow, tip, 0.075)
		for twig in range(3):
			var end := tip + Vector3(_rng.randf_range(-0.7, 0.7), 0.35, _rng.randf_range(-0.7, 0.7))
			_branch(tip, end, 0.027)
			if not blossom and index % 2 == 0:
				_wisteria(end)
	# Fill several overlapping crown volumes, including the lower skirt. Uniform
	# azimuth + sqrt radius avoids both sparse outer twigs and a solid sphere.
	for index in range(240):
		var angle := _rng.randf() * TAU
		var radius := sqrt(_rng.randf()) * spread
		var point := root + Vector3(cos(angle) * radius, 0, sin(angle) * radius)
		point.y += height * 0.9 + _rng.randf_range(-1.35, 1.25) - radius * 0.12
		var size := _rng.randf_range(1.0, 1.65)
		var leaves := Color("84956b").lerp(Color("c0c596"), _rng.randf() * 0.7)
		if blossom and index % 4 != 0:
			var pink := Color("d2a2af").lerp(Color("f1d9d6"), _rng.randf() * 0.75)
			_card("Sakura", point, Vector3(size * 1.3, size, size), pink)
		else:
			_card("Leaves", point, Vector3(size * 1.4, size, size), leaves)
	for root_index in range(5):
		var direction := Vector3(cos(root_index * 1.257), 0, sin(root_index * 1.257))
		_branch(root + Vector3.UP * 0.45, root + direction * 1.2 + Vector3.UP * 0.03, 0.16)


func _wisteria(origin: Vector3) -> void:
	var length := _rng.randf_range(1.2, 2.2)
	_branch(origin, origin - Vector3.UP * length, 0.014)
	for tier in range(7):
		var t := tier / 6.0
		var width := lerpf(0.62, 0.12, t)
		_card(
			"Wisteria",
			origin - Vector3.UP * length * t,
			Vector3(width, 0.48, width),
			Color("b0a2cf").lerp(Color("d8c9e1"), _rng.randf() * 0.7)
		)


func _bamboo(center: Vector3) -> void:
	for culm in range(13):
		var root := center + Vector3(_rng.randf_range(-1.5, 1.5), 0, _rng.randf_range(-1.3, 1.3))
		var height := _rng.randf_range(4.5, 7.8)
		var lean := Vector3(_rng.randf_range(-0.7, 0.7), 0, _rng.randf_range(-0.6, 0.6))
		for segment in range(8):
			var start := root + Vector3.UP * height * segment / 8.0 + lean * segment / 8.0
			var end := root + Vector3.UP * height * (segment + 1) / 8.0 + lean * (segment + 1) / 8.0
			_branch(start, end, 0.055, "Bamboo")
			_branch(end - Vector3.UP * 0.025, end + Vector3.UP * 0.025, 0.075, "Bamboo")
			if segment < 3:
				continue
			for spray in range(3):
				var angle := culm * 2.399 + spray * 2.094 + segment
				var tip := end + Vector3(cos(angle), 0.15, sin(angle)) * 0.7
				_card("BambooLeaves", tip, Vector3(1.5, 0.7, 1.0), Color("97ae79"))


func _banks() -> void:
	for index in range(110):
		var angle := index * TAU / 110 + _rng.randf_range(-0.025, 0.025)
		var point := Vector3(-22 + cos(angle) * 10.7, 0.07, -3 + sin(angle) * 19.7)
		if absf(point.z + 3) < 2.3 or point.z < -23.2:
			continue
		var size := _rng.randf_range(0.65, 1.25)
		_add(
			"Moss",
			Transform3D(Basis(Vector3.UP, angle).scaled(Vector3(size * 1.7, 1, size)), point),
			Color("718054")
		)
		if index % 3 == 0:
			_card("Ferns", point + Vector3.UP * 0.05, Vector3.ONE * size, Color("91a570"))
		if index % 2 == 0:
			_card("Leaves", point + Vector3.UP * 0.4, Vector3(size, 0.8, size), Color("a1b486"))
		if index % 5 == 0:
			_card("Sakura", point + Vector3.UP * 0.6, Vector3.ONE * 0.6, Color("dbc5cd"))
		if index % 4 == 0:
			_card("BankStones", point, Vector3(size, size * 0.5, size * 0.8), Color("8d947e"))


func _lotus() -> void:
	for index in range(42):
		var angle := _rng.randf() * TAU
		var radius := _rng.randf_range(0.45, 0.9)
		var point := Vector3(
			-22 + cos(angle) * 9.0 * radius, WATER_HEIGHT, -3 + sin(angle) * 18 * radius
		)
		if absf(point.z + 3) < 2.7 or point.z < -18.8:
			continue
		var size := _rng.randf_range(0.5, 0.95)
		_add(
			"LotusPads",
			Transform3D(Basis(Vector3.UP, angle).scaled(Vector3(size, 1, size)), point),
			Color("73966c")
		)
		if index % 3 == 0:
			_add(
				"LotusFlowers",
				Transform3D(
					Basis(Vector3.UP, angle).scaled(Vector3.ONE * size), point + Vector3.UP * 0.08
				),
				Color("ebc8c8")
			)


func _bamboo_mesh() -> CylinderMesh:
	var mesh := CylinderMesh.new()
	mesh.top_radius = 1.0
	mesh.bottom_radius = 1.0
	mesh.height = 1.0
	mesh.radial_segments = 6
	mesh.rings = 0
	mesh.material = _nature.surface(Color.WHITE)
	return mesh


func _stone_mesh() -> SphereMesh:
	var mesh := SphereMesh.new()
	mesh.radius = 0.5
	mesh.height = 1.0
	mesh.radial_segments = 8
	mesh.rings = 4
	mesh.material = _nature.surface(Color.WHITE)
	return mesh


func _pad_mesh(lotus: bool) -> ArrayMesh:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for index in range(18):
		var a := (index + 0.35) * TAU / 18
		var b := (index + 1.35) * TAU / 18
		if lotus and index == 17:
			continue
		for point in [Vector3.ZERO, Vector3(cos(b), -0.01, sin(b)), Vector3(cos(a), -0.01, sin(a))]:
			surface.add_vertex(point)
	surface.generate_normals()
	surface.set_material(_nature.surface(Color.WHITE))
	return surface.commit()


func _lotus_mesh() -> ArrayMesh:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for tier in range(2):
		for petal in range(9):
			var angle := petal * TAU / 9 + tier * 0.3
			var outward := Vector3(cos(angle), 0, sin(angle))
			var across := Vector3(-sin(angle), 0, cos(angle)) * 0.12
			var base := Vector3.UP * 0.03
			var mid := outward * (0.26 - tier * 0.06) + Vector3.UP * 0.12
			var tip := outward * (0.48 - tier * 0.17) + Vector3.UP * (0.22 + tier * 0.2)
			for point in [base, mid + across, mid - across, mid + across, tip, mid - across]:
				surface.add_vertex(point)
	surface.generate_normals()
	var material := _nature.surface(Color.WHITE)
	material.cull_mode = BaseMaterial3D.CULL_DISABLED
	surface.set_material(material)
	return surface.commit()
