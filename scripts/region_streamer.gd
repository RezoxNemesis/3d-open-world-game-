extends Node3D
## A bounded synchronous region owner. Future asynchronous jobs can replace the factory.

signal region_loaded(key: Vector2i)
signal region_unloaded(key: Vector2i)

const CHUNK_SIZE := 128.0
var factory: Callable
var active: Dictionary = {}
var target: Node3D
var refresh_time := 0.0
var last_center := Vector2i(999999, 999999)


func update_regions(origin: Vector3) -> void:
	var center := Vector2i(
		floori((origin.x + 64) / CHUNK_SIZE), floori((origin.z + 64) / CHUNK_SIZE)
	)
	if center == last_center:
		return
	last_center = center
	var wanted: Dictionary = {}
	for x in range(center.x - 1, center.x + 2):
		for z in range(center.y - 1, center.y + 2):
			wanted[Vector2i(x, z)] = true
	for key in active.keys():
		if not wanted.has(key):
			var region := active[key] as Node3D
			remove_child(region)
			region.queue_free()
			active.erase(key)
			region_unloaded.emit(key)
	for key in wanted:
		if not active.has(key):
			var region := factory.call(key) as Node3D
			region.name = "Region_%d_%d" % [key.x, key.y]
			add_child(region)
			active[key] = region
			region_loaded.emit(key)


func _process(delta: float) -> void:
	refresh_time += delta
	if refresh_time >= 0.5 and is_instance_valid(target):
		refresh_time = 0
		update_regions(target.global_position)
