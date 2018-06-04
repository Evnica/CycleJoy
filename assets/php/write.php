<?php
$data = $_POST['markers'];
chmod("data/userMarkers.json",0777);
$w = fopen("data/userMarkers.json", "w+");
fwrite($w, $data);
fclose($w);
?>