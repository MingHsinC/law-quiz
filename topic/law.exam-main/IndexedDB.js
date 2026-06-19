
function openIndexedDB () {
  // This works on all devices/browsers, and uses IndexedDBShim as a final fallback 
  var indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB || window.shimIndexedDB;

  var openDB = indexedDB.open("myexam", 2);

  openDB.onupgradeneeded = function() {
    var db = {}
    db.result = openDB.result;

    db.store = db.result.createObjectStore('law.exam', {
            autoIncrement: true
        });
	db.index = db.store.createIndex('quiz', 'quiz', {
            unique: false
        });
  };

  return openDB;
}

function getStoreIndexedDB (openDB) {
  var db = {};
  db.result = openDB.result;
  db.tx = db.result.transaction("law.exam", "readwrite");
  db.store = db.tx.objectStore("law.exam");
  db.index = db.store.index("quiz");

  return db;
}

function savequiz (qa) {
  var openDB = openIndexedDB();

  openDB.onsuccess = function() {
	  
    getStoreIndexedDB(openDB).store.put(qa);
  }
  
   openDB.oncomplete = function() {
       openDB.close();
   };
 
  return true;
}

function delquiz(qa) {
    

  let openDB = openIndexedDB();

  openDB.onsuccess = function(event) {
	
		let getKeyRequest = getStoreIndexedDB(openDB).index.getKey(qa.quiz);
	
		getKeyRequest.onsuccess = function() {
			  getStoreIndexedDB(openDB).store.delete( getKeyRequest.result );
		}
		
		
   
	
  }
  
   // handle the error case
    openDB.onerror = function (event) {
        console.log(event.target.errorCode);
    }
  
   openDB.oncomplete = function() {
       openDB.close();
   };
 

}


function findIndexedDB (filesearch, callback) {
  return loadIndexedDB(null, callback, filesearch);
}

function loadIndexedDB (filename, callback, filesearch) {
  var openDB = openIndexedDB();

  openDB.onsuccess = function() {
    var db = getStoreIndexedDB(openDB);

    var getData;
    if (filename) {
      getData = db.store.get(filename);
    } else {
      getData = db.index.get(filesearch);
    }
    
    getData.onsuccess = function() {
      callback(getData.result.data);
    };

   openDB.oncomplete = function() {
      openDB.close();
    };
  }

  return true;
}



function getAllquiz(callback) {
	let selcount=0, qadata=[];
	var openDB = openIndexedDB();

	openDB.onsuccess = function() {
		var db = getStoreIndexedDB(openDB);

		var getData = db.store.openCursor();
	
    
		getData.onsuccess = function(evt) {
			let cursor = evt.target.result;
			
			 if (cursor) {
               	let quiz = cursor.value;	
				
				 qadata.push(quiz);
				
				if (quiz.answer){
					if (Object.keys(quiz.answer).length==1)
						selcount++;
				
				}
					// continue next record
               		 	cursor.continue();
            		}
			else{
				callback( qadata, selcount);
			}
		};

		getData.oncomplete = function() {
		openDB.close();
	};
  }
    return true;
}

function clearquiz() {
    var openDB = openIndexedDB();

	openDB.onsuccess = function() {
	
		var db = getStoreIndexedDB(openDB);

		var clearData = db.store.clear();
		
		clearData.onsuccess = function(evt) {
			alert("錯題已清除!!");
		};
	 
		clearData.onerror = function (evt) {
		console.error("clearquiz:", evt.target.errorCode);
		};
		
		clearData.oncomplete = function() {
		openDB.close();
		};
  }
}