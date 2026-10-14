extends Node
## Discovery is earned by reaching a landmark; only discovered waypoints allow travel.

signal changed

const DISCOVERY_RADIUS := 7.0
var landmarks: Array[Dictionary] = [
	{"id": "sanctuary", "name": "Cloud Sanctuary", "position": Vector3(0, 1.8, -16)},
	{"id": "lotus", "name": "Lotus Overlook", "position": Vector3(-30, 0, 1)},
	{"id": "gate", "name": "Eastern Gate", "position": Vector3(30, 0, -4)}
]
var discovered: Dictionary = {}


func restore_discovered(ids: Variant) -> void:
	discovered.clear()
	if ids is Array:
		for id in ids:
			for landmark in landmarks:
				if id is String and id == landmark.id:
					discovered[id] = true
	changed.emit()


func visit(position: Vector3) -> void:
	for landmark in landmarks:
		var point: Vector3 = landmark.position
		var distance := Vector2(position.x, position.z).distance_to(Vector2(point.x, point.z))
		if distance <= DISCOVERY_RADIUS and not discovered.has(landmark.id):
			discovered[landmark.id] = true
			changed.emit()


func current_objective() -> String:
	for landmark in landmarks:
		if not discovered.has(landmark.id):
			return "Discover " + str(landmark.name)
	return "District discovery complete"


func travel(id: String, player: CharacterBody3D) -> bool:
	if not discovered.has(id) or not is_instance_valid(player):
		return false
	for landmark in landmarks:
		if landmark.id == id:
			player.global_position = landmark.position + Vector3(0, 0.12, 0)
			player.velocity = Vector3.ZERO
			return true
	return false
