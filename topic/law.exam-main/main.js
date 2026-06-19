        var currentIndex = 0, qa = [], total = 0, sel_cnt=0, frac_top=0, frac_bottom=0;
 
		let menu ="";
        $(function() {
		let yr=111; //set year 
		for (;yr>99;yr--){ 
			menu += '<li class="nav-item dropdown">' +
					'<div class="nav-link dropdown-toggle"  id="'+ yr+'" role="button" data-bs-toggle="dropdown" aria-expanded="false">'+
					 yr + '</div>'+
					 '<ul class="dropdown-menu" aria-labelledby="'+ yr +'">';
			if (yr>102){
				menu += 
					'<li><a class="dropdown-item" href="#">'+yr+'綜合法學(一)(刑法、刑事訴訟法、法律倫理)</a></li>'+
					'<li><a class="dropdown-item" href="#">'+yr+'綜合法學(一)(憲法、行政法、國際公法、國際私法)</a></li>'+
					'<li><a class="dropdown-item" href="#">'+yr+'綜合法學(二)(民法、民事訴訟法)</a></li>'+
					'<li><a class="dropdown-item" href="#">'+yr+'綜合法學(二)(公司法、保險法、票據法、證券交易法、強制執行法、法學英文)</a></li>'+			
					'</ul></li>';
			}
			else{
				menu += 
					'<li><a class="dropdown-item" href="#">'+yr+'司-綜合法學(一)(刑法、刑事訴訟法、法律倫理)</a></li>'+
					'<li><a class="dropdown-item" href="#">'+yr+'律-綜合法學(一)(刑法、刑事訴訟法、法律倫理)</a></li>'+
					'<li><a class="dropdown-item" href="#">'+yr+'司-綜合法學(一)(憲法、行政法、國際公法、國際私法)</a></li>'+
					'<li><a class="dropdown-item" href="#">'+yr+'律-綜合法學(一)(憲法、行政法、國際公法、國際私法)</a></li>'+
					'<li><a class="dropdown-item" href="#">'+yr+'司-綜合法學(二)(民法、民事訴訟法)</a></li>'+
					'<li><a class="dropdown-item" href="#">'+yr+'律-綜合法學(二)(民法、民事訴訟法)</a></li>'+
					'<li><a class="dropdown-item" href="#">'+yr+'司-綜合法學(二)(公司法、保險法、票據法、海商法、證券交易法、法學英文)</a></li>'+
					'<li><a class="dropdown-item" href="#">'+yr+'律-綜合法學(二)(公司法、保險法、票據法、海商法、證券交易法、法學英文)</a></li>'+
					'</ul></li>';
			}
			
		}
		menu += '<li><a class="nav-link btn-outline-danger" href="#" >複習錯題</a></li>';
		$(".navbar-nav").html(menu);
		
	
		$('#qa-quiz').html("請選擇年度及考試!!");
		$("#helper").hide();
		
		
		 $('.qa-previous').click(qa_pvs);
         $('.qa-next').click(qa_nxt);
         $('.qa-jump').click(qa_jmp);	
		 $('.qa-random').click(qa_rnd);

		$(document).keypress(function(e) {
				if(e.which == '110'||e.which=='78') {
					qa_nxt();
				}
				if (e.which=='112'||e.which=='80'){
					qa_pvs();
				}
				if (e.which=='106'||e.which=='74'){
					qa_jmp();
				}
				if (e.which=='114'||e.which=='82'){
					qa_rnd();
				}
		});		  
				

	
		function qa_pvs(){
            currentIndex -= 1;
            if(currentIndex < 0) {
              currentIndex = total - 1;
            }
            showQuiz();       
        }

		function qa_nxt(){
            currentIndex += 1;
            if(currentIndex >= total) {
              currentIndex = 0;
            }
            showQuiz();            
         }
		 
		 function qa_jmp(){
            let userIndex = window.prompt('輸入 1-' + total + ' 數字');
			if (userIndex != null) {
				userIndex = parseInt(userIndex) ;
				 if (isNaN(userIndex)) { return false; }
				 currentIndex = userIndex-1;
				showQuiz();
			}            
          }
		  
		 function qa_rnd(){
			currentIndex = Math.floor(Math.random() * qa.length);
            showQuiz();
          }
	
			$(".nav a").on("click", function(){
				
				$("#helper").show();
		
			$(".nav").find(".active").removeClass("active");
			$(this).addClass("active");
			
			if (  $(this).text() ==='複習錯題'){
		
				getAllquiz(function(qadata, selcount){
					
					if ( qadata.length!=0 ){
						qa = qadata; sel_cnt = selcount; total = qa.length; currentIndex= 0;
						$('.navbar-brand').text( '複習錯題' );
						$(".btn-outline-danger").text('清除錯題');
						$("a#ori-pdf").attr('href', '' )
							.text( '' );
						showQuiz();

					}
					else{
						alert('沒有錯題');
					}
				});
			
			}
			else if ( $(this).text() === '清除錯題' ){
				$(".btn-outline-danger").text('複習錯題');
				 clearquiz();
			}
			else{
				selectquiz( $(this).text() );	
			}
				//auto navbar collapse
				$('.navbar-toggler').click();
			});
        })
		
		function selectquiz( txt ){
		
		//reset to 複習錯題
		$(".btn-outline-danger").text('複習錯題');
		
		$('.navbar-brand').text( txt );
		
			txt = txt.slice(0,3)+ "/" + txt;

			
		
			
			$('#qa-quiz').html('<div class="spinner-border text-primary"></div>');
			
			qa =[];
			
			 $.get( txt+'.txt', function(data) {
			
				let line = data.split('\n');
				let quiz, chA, chB, chC, chD, chE;
				let checkpoint = false;
				for ( let i=0;i < line.length;i++ ){
					if (checkpoint){
						chA="(A)"; chB="(B)"; chC="(C)"; chD="(D)"; chE="(E)";
							
								if (!isNaN(parseFloat(line[i].replace(/\r/g, '')[0]))){
									if ( (//g).test(line[i+1]) ){ //choiceA.
										
										quiz = line[i];
										i++;
									}
									else{
										quiz="";
										for ( let j=0; j<7; j++ ){										
											if ( (//g).test(line[i+j])){
											 i= i+j;
											 break;
											}		
											quiz += line[i+j];
										}
									}
									

										if  (( (//g).test(line[i]) )){ //choice E in  line
											chE += line[i].slice(line[i].indexOf('')+1 ,  line[i].length);
											chD += line[i].slice(line[i].indexOf('')+1,  line[i].indexOf('') );
											chC += line[i].slice(line[i].indexOf('')+1 , line[i].indexOf('') );
											chB += line[i].slice(line[i].indexOf('')+1 , line[i].indexOf('') );
											chA += line[i].slice(line[i].indexOf('')+1 , line[i].indexOf('') );	
										}
										else if (( (//g).test(line[i]) )){ //choice D in  line
											chD += line[i].slice( line[i].indexOf('')+1, line[i].length);
											chC += line[i].slice(line[i].indexOf('')+1 , line[i].indexOf('') );
											chB += line[i].slice(line[i].indexOf('')+1 , line[i].indexOf('') );
											chA += line[i].slice(line[i].indexOf('')+1 , line[i].indexOf('') );
											chE = "";
										}									
										else if (( (//g).test(line[i]) )) { //choice B in  line
											chB += line[i].slice(line[i].indexOf('')+1 , line[i].length );
											chA += line[i].slice(line[i].indexOf('')+1 , line[i].indexOf('') );
											chD += line[i+1].slice( line[i+1].indexOf('')+1, line[i+1].length);
											chC += line[i+1].slice(line[i+1].indexOf('')+1 , line[i+1].indexOf('') );
											chE = "";
											i=i+1;
										}
										else{
														
											
												
											chA += line[i].slice(1, line[i].length);
											for ( let j=1;j<5;j++ ){
												
												if (  line[i+j].charAt(0)===''){
													i= i+j;
													break;
												}		
											chA += line[i+j];
											}
											if ((//g).test(line[i]) ) { //choice C in  line
											
												chC += line[i].slice(line[i].indexOf('')+1 , line[i].length );
												chB += line[i].slice(1 , line[i].indexOf('') );
												for ( let j=1;j<5;j++ ){	
													if (  line[i+j].charAt(0)===''){
														i= i+j;
													break;
													}		
												}
											}
											else{
												chB += line[i].slice(1, line[i].length);
												for ( let j=1;j<5;j++ ){
													//line[i+j]= line[i+j].replace(/\r/g, '');
													if ( line[i+j].charAt(0)==='' ){
													i= i+j;
													break;
												}		
												chB += line[i+j];
											}
											
												chC += line[i].slice(1, line[i].length);
												for ( let j=1;j<5;j++ ){	
												
												if (  line[i+j].charAt(0)===''){
													i= i+j;
													break;
												}		
												chC += line[i+j];
												}
											}
								
												
											chD += line[i].slice(1, line[i].length);
											for ( let j=1;j<3;j++ ){	
												
												if (  parseInt(line[i+j].slice(0, 2))==(qa.length+2)){
													i= i+j-1;
													chE = "";
													break;
												}
												else if (  line[i+j].charAt(0)===''){
													i= i+j;
													chE += line[i].slice(1, line[i].length);
													//i++;
													break;
												}
												else{
													chE="";
												}
												
												chD += line[i+j];
											}
											
			
 										}
								}
								else{
									continue;
								}
							
								qa.push({
								"quiz": quiz,
								"options": {
								"A": chA,
								"B": chB,
								"C": chC,
								"D": chD,
								"E": chE
								},
								"answer":null,
								"choice":1
								});						
					}
					else if ( line[i].indexOf('禁止使用電子計算器')!=-1 ){
						checkpoint= true;
					}
					else{
						//console.log(line[i]);
					}
				
				}//end of for loop	
				
			}, 'text').done(function() {
				
				 $.get( txt+'ANS.txt', function(data) {
					sel_cnt=0;
					
					let line = data.split('\r');
					
					let index =0, ansArray=[];
					
					for ( let i=0;i<line.length;i++ ){
					
						if ( /[A-E]/g.test(line[i]) || line[i]==='#'){
							
							line[i] = line[i].replace(/\n/g, '')
							
							if (line[i].length!=1){
							
								ansArray=[];
								
								qa[index].choice= 2;
								
								for (var j=0; j<line[i].length; j++){

									ansArray.push( line[i][j] );
									
								}
								
								qa[index].answer = ansArray;
								
							}
							else{
								
								qa[index].answer= line[i];
								
								sel_cnt++;
							}
							
							index++;

							if ( index == qa.length)
								return;
						}
						
				
					}//end of for loop	
				}, 'text').done(function() {
					
							total = qa.length;
					
							currentIndex = Math.floor(Math.random() * qa.length);  //= 0;
					
							showQuiz();
				
				});
			
			});

				
			
		}
		
        function showQuiz() {
		window.scrollTo(0, 0);
		
          if (currentIndex > qa.length)
			currentIndex=0;
			
		  $('#qa-result').html('');
          $('#qa-quiz').html(qa[currentIndex].quiz);
          var answers = '';
		  
		  if (qa[currentIndex].choice==1){
			for(k in qa[currentIndex].options) {
				if( qa[currentIndex].options[k].length!=0 )
				    answers +=  '<div class="form-check"><input class="form-check-input qa-options" type="radio" name="answer"  id="' + k + '" value="' + k + '">' +
						'<label class="form-check-label" for="'+ k +'">'+qa[currentIndex].options[k]+'</label></div>';
			}
		  }
		  else{
			for(k in qa[currentIndex].options) {
				if( qa[currentIndex].options[k].length!=0 )
					   answers +=  '<div class="form-check"><input class="form-check-input qa-multi-options" type="checkbox" name="answer"  id="' + k + '" value="' + k + '">' +
						'<label class="form-check-label" for="'+ k +'">'+qa[currentIndex].options[k]+'</label></div>';
			}
			
			answers += '<button type="button" class="btn btn-primary" onclick="multichoice()">答題</button>';
			
		  }
	  
		  
          $('#qa-answer').html(answers);
		  
		  //答題
          $('input.qa-options').change(function() {
		  
            var selected = $(this).val();
            if(selected == qa[currentIndex].answer) {
             
			     $('#qa-result').css({'color':'green'});
		
				$('#qa-result').html('答對&#128077;' );
				
				frac_top++;frac_bottom++;
		    		
		    	window.scrollTo(0, document.body.scrollHeight);
				
				//複習錯題時 刪除答對錯題
				if ($(".nav").find(".active").text()==='清除錯題')
					delquiz(qa[currentIndex]);
					
					
            }else if( qa[currentIndex].answer ==='#' ){
				$('#qa-result').html("本題一律給分！");
			}
			else {
				$('#qa-result').css({'color':'red'});
				$('#'+ qa[currentIndex].answer+'+ label').css({'background-color': 'yellow',
																'color': 'red'});
				//unicode cry face symbol:&#128077;												
				$('#qa-result').html('答錯了&#128557;'  );
           
			  frac_bottom++;
			  savequiz(qa[currentIndex]);
              
            }
			
			
          });
		  
			frac_Progress();

        }
		
		function multichoice() {
		
			var userAns = [];
			var checkboxes = document.getElementsByName('answer');
			
			for(let i = 0;i< checkboxes.length;  i++ )
			{
				if(checkboxes[i].checked){  
					userAns.push( checkboxes[i].value );
				}
			}
	
				if( JSON.stringify(userAns)!=JSON.stringify(qa[currentIndex].answer) ) {
					let theAns="";
					
					
					qa[currentIndex].answer.forEach(function(value){
						$('#'+  value +'+ label').css({'background-color': 'yellow',
																'color': 'red'});
					});
							
		
				$('#qa-result').css({'color':'red'});				
				$('#qa-result').html('答錯了&#128557;'  );
           
				frac_bottom++;
				savequiz(qa[currentIndex]);
				}
				else{
				
					     $('#qa-result').css({'color':'green'});
		
				$('#qa-result').html('答對&#128077;'); 
				
				frac_top++;frac_bottom++;
		    		
		    	window.scrollTo(0, document.body.scrollHeight);
				
				//複習錯題時 刪除答對錯題
				if ($(".nav").find(".active").text()==='清除錯題')
					delquiz(qa[currentIndex]);
				
				}
				
          }
		  
		  function frac_Progress(){
			$('.frac span.bottom').text(frac_bottom);
			$('.frac span.top').text(frac_top);
			
			let pass= frac_top/frac_bottom*100;

			if ( pass < 70 )
				$('.percent').css({'color':'red','font-weight': 'bold'});				
			else
				$('.percent').css({'color':'green'});	
		
			$('.percent').val( (frac_top/frac_bottom*100).toFixed(1));
			
			let valeur =((currentIndex + 1)/total*100).toFixed(1);
			$('.progress-bar').css('width', valeur +'%')
							.attr('aria-valuenow', valeur);
			$('.w-100').text(  (currentIndex + 1) + ' / ' + '單選：'+sel_cnt+'+複選：'+(total-sel_cnt) );
		  }
