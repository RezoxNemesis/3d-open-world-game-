extends Node3D
## Original pooled geometry effects: three MultiMesh draws, no extra physics bodies.

const CAPACITY := {"streak": 24, "echo": 6, "ring": 4}
var pools: Dictionary = {}
var slots: Dictionary = {}
var _cursor := {"streak": 0, "echo": 0, "ring": 0}
var _trail_clock := 0.0
var _echo_clock := 0.0
var _charge_clock := 0.0
var _built := false


func setup(world: Node3D) -> void:
	if _built:
		return
	_built = true
	name = "HeroPowerFX"
	var streak := BoxMesh.new()
	streak.size = Vector3(0.035, 0.035, 1.0)
	var ring := TorusMesh.new()
	ring.inner_radius = 0.91
	ring.outer_radius = 1.0
	ring.rings = 24
	ring.ring_segments = 4
	var meshes := {"streak": streak, "echo": _echo_mesh(), "ring": ring}
	for kind in CAPACITY:
		var node := MultiMeshInstance3D.new()
		node.name = str(kind).capitalize() + "Pool"
		var material := StandardMaterial3D.new()
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		material.vertex_color_use_as_albedo = true
		material.cull_mode = BaseMaterial3D.CULL_DISABLED
		node.material_override = material
		node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var batch := MultiMesh.new()
		batch.transform_format = MultiMesh.TRANSFORM_3D
		batch.use_colors = true
		batch.mesh = meshes[kind]
		batch.instance_count = CAPACITY[kind]
		node.multimesh = batch
		add_child(node)
		pools[kind] = batch
		slots[kind] = []
		for index in range(CAPACITY[kind]):
			slots[kind].append(
				{
					"age": 0.0,
					"life": 0.0,
					"at": Transform3D.IDENTITY,
					"color": Color.TRANSPARENT,
					"growth": 0.0
				}
			)
			batch.set_instance_transform(
				index, Transform3D(Basis.IDENTITY.scaled(Vector3.ZERO), Vector3.ZERO)
			)
			batch.set_instance_color(index, Color.TRANSPARENT)
	if world.has_signal("rebased"):
		world.rebased.connect(rebase)


func advance(delta: float, player: CharacterBody3D, actual: Vector3, state: Dictionary) -> void:
	for kind in slots:
		for index in range(slots[kind].size()):
			var entry: Dictionary = slots[kind][index]
			if entry.life <= 0.0:
				continue
			entry.age += delta
			if entry.age >= entry.life:
				entry.life = 0.0
				pools[kind].set_instance_color(index, Color.TRANSPARENT)
				pools[kind].set_instance_transform(
					index, Transform3D(Basis.IDENTITY.scaled(Vector3.ZERO), Vector3.ZERO)
				)
				continue
			var at: Transform3D = entry.at
			if kind == "ring":
				var size: float = 0.35 + entry.age * entry.growth
				at.basis = at.basis.scaled(Vector3(size, 0.10, size))
			var tint: Color = entry.color
			tint.a *= pow(1.0 - entry.age / entry.life, 1.4)
			pools[kind].set_instance_transform(index, at)
			pools[kind].set_instance_color(index, tint)
	var speed := actual.length()
	var action: String = state.get("action", "")
	var trails := action in ["speed", "flight", "flight_launch", "leap"] and speed > 12.0
	_trail_clock += delta
	_echo_clock += delta
	if trails and _trail_clock >= 0.035:
		_trail_clock = 0.0
		var direction := actual.normalized()
		var basis := Basis.looking_at(
			direction, Vector3.RIGHT if absf(direction.y) > 0.95 else Vector3.UP
		)
		for side in [-1.0, 1.0]:
			var point: Vector3 = player.global_position + Vector3.UP * 0.9 + basis.x * side * 0.38
			var length := clampf(speed * 0.045, 0.7, 4.5)
			_spawn(
				"streak",
				Transform3D(basis.scaled(Vector3(1, 1, length)), point - direction * length * 0.5),
				Color(0.58, 0.92, 1.0, 0.68),
				0.25
			)
	if trails and action == "speed" and _echo_clock >= 0.075:
		_echo_clock = 0.0
		var at: Transform3D = player.model.global_transform
		_spawn("echo", at, Color(0.46, 0.79, 0.88, 0.22), 0.32)
	_charge_clock += delta
	if action in ["leap_charge", "flight_crouch"] and _charge_clock >= 0.16:
		_charge_clock = 0.0
		burst(player.global_position + Vector3.UP * 0.08, 2.2, Color(1.0, 0.81, 0.39, 0.45), 0.42)


func burst(point: Vector3, growth: float, color: Color, duration := 0.55) -> void:
	_spawn("ring", Transform3D(Basis.IDENTITY, point), color, duration, growth)


func clear() -> void:
	for kind in slots:
		for index in range(slots[kind].size()):
			slots[kind][index].life = 0.0
			pools[kind].set_instance_color(index, Color.TRANSPARENT)
			pools[kind].set_instance_transform(
				index, Transform3D(Basis.IDENTITY.scaled(Vector3.ZERO), Vector3.ZERO)
			)
	_trail_clock = 0.0
	_echo_clock = 0.0
	_charge_clock = 0.0


func active_count(kind: String = "") -> int:
	var count := 0
	for key in slots:
		if not kind.is_empty() and key != kind:
			continue
		for entry: Dictionary in slots[key]:
			if entry.life > 0.0:
				count += 1
	return count


func rebase(offset: Vector3) -> void:
	for kind in slots:
		for index in range(slots[kind].size()):
			var entry: Dictionary = slots[kind][index]
			if entry.life > 0.0:
				entry.at.origin -= offset
				var at: Transform3D = pools[kind].get_instance_transform(index)
				at.origin -= offset
				pools[kind].set_instance_transform(index, at)


func _spawn(kind: String, at: Transform3D, color: Color, life: float, growth := 0.0) -> void:
	if not _built:
		return
	var index: int = _cursor[kind]
	_cursor[kind] = (index + 1) % CAPACITY[kind]
	slots[kind][index] = {"at": at, "color": color, "life": life, "age": 0.0, "growth": growth}
	pools[kind].set_instance_transform(index, at)
	pools[kind].set_instance_color(index, color)


func _echo_mesh() -> ArrayMesh:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	# A sparse humanoid memory of the moving pose, rather than six full avatar copies.
	for part in [
		[Vector3(0, 1.10, 0), Vector3(0.33, 0.49, 0.20)],
		[Vector3(0, 1.52, 0), Vector3(0.17, 0.23, 0.16)],
		[Vector3(-0.12, 0.46, 0.08), Vector3(0.12, 0.70, 0.13)],
		[Vector3(0.12, 0.46, -0.08), Vector3(0.12, 0.70, 0.13)],
		[Vector3(-0.26, 1.01, -0.10), Vector3(0.10, 0.48, 0.12)],
		[Vector3(0.26, 1.01, 0.10), Vector3(0.10, 0.48, 0.12)]
	]:
		var mesh := SphereMesh.new()
		mesh.radius = 0.5
		mesh.height = 1.0
		mesh.radial_segments = 8
		mesh.rings = 3
		surface.append_from(mesh, 0, Transform3D(Basis.IDENTITY.scaled(part[1]), part[0]))
	return surface.commit()
